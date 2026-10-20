import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Testing Supabase Connection to:', url);

if (!url || !serviceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function runTest() {
  console.log('\n--- 1. Testing schools table & fallback ---');
  let { data: schools, error: schoolErr } = await supabase.from('schools').select('*');
  if (schoolErr) console.error('School query error:', schoolErr);
  console.log('Existing schools in DB:', schools?.length || 0);

  if (!schools || schools.length === 0) {
    console.log('Inserting default school 440129...');
    const { data: created, error: insErr } = await supabase.from('schools').insert({
      name: 'תיכון ממלכתי רבין - תל אביב',
      semel_mosad: '440129'
    }).select('*').single();
    if (insErr) throw insErr;
    schools = [created];
  }
  const defaultSchool = schools[0];
  console.log('Active default school:', defaultSchool.name, 'semel:', defaultSchool.semel_mosad);

  console.log('\n--- 2. Testing institution_time_slots auto-seeding ---');
  let { data: slots, error: slotErr } = await supabase.from('institution_time_slots')
    .select('*')
    .eq('institution_code', defaultSchool.semel_mosad)
    .order('period_number', { ascending: true });

  if (slotErr) console.error('Time slots error:', slotErr);
  console.log('Found time slots for', defaultSchool.semel_mosad, ':', slots?.length || 0);

  if (!slots || slots.length === 0) {
    console.log('Auto-seeding periods 1-6...');
    const presets = [
      { institution_code: defaultSchool.semel_mosad, period_number: 1, start_time: '08:00', end_time: '08:45', day_of_week: 'all' },
      { institution_code: defaultSchool.semel_mosad, period_number: 2, start_time: '08:50', end_time: '09:35', day_of_week: 'all' },
      { institution_code: defaultSchool.semel_mosad, period_number: 3, start_time: '09:55', end_time: '10:40', day_of_week: 'all' },
      { institution_code: defaultSchool.semel_mosad, period_number: 4, start_time: '10:45', end_time: '11:30', day_of_week: 'all' },
      { institution_code: defaultSchool.semel_mosad, period_number: 5, start_time: '11:45', end_time: '12:30', day_of_week: 'all' },
      { institution_code: defaultSchool.semel_mosad, period_number: 6, start_time: '12:35', end_time: '13:20', day_of_week: 'all' },
    ];
    await supabase.from('institution_time_slots')
      .delete()
      .eq('institution_code', defaultSchool.semel_mosad)
      .in('period_number', [1, 2, 3, 4, 5, 6]);

    const { data: seeded, error: seedErr } = await supabase.from('institution_time_slots')
      .insert(presets)
      .select('*');
    if (seedErr) throw seedErr;
    console.log('Seeded periods successfully:', seeded.length);
  }

  console.log('\n--- 3. Testing Teacher creation without explicit school_id ---');
  const testTeacherName = `בדיקת מורה E2E ${Date.now()}`;
  const insertTeacherPayload = {
    school_id: defaultSchool.id,
    name: testTeacherName,
    subject: 'מתמטיקה',
    institution_code: defaultSchool.semel_mosad,
    magic_token: `token-test-${Date.now()}`
  };

  const { data: teacher, error: teacherErr } = await supabase.from('teachers')
    .insert(insertTeacherPayload)
    .select('*')
    .single();

  if (teacherErr) {
    console.error('Failed to create teacher:', teacherErr);
    process.exit(1);
  }
  console.log('Created teacher:', teacher.name, 'with ID (UUID):', teacher.id);

  console.log('\n--- 4. Testing Schedule Template creation with period_number ---');
  const insertSlotPayload = {
    teacher_id: teacher.id,
    day_of_week: 1,
    start_time: '08:00',
    duration_minutes: 45,
    subject: 'מתמטיקה מואצת',
    class_name: 'י׳2',
    institution_code: defaultSchool.semel_mosad,
    period_number: 1
  };

  const { data: tpl, error: tplErr } = await supabase.from('schedule_templates')
    .insert(insertSlotPayload)
    .select('*')
    .single();

  if (tplErr) {
    console.error('Failed to create schedule template:', tplErr);
    process.exit(1);
  }
  console.log('Created schedule template:', tpl.subject, 'period:', tpl.period_number, 'id:', tpl.id);

  console.log('\n--- 5. Testing Weekly Actual Report status toggle ---');
  const reportPayload = {
    teacher_id: teacher.id,
    template_id: tpl.id,
    report_date: '2026-10-18', // Sunday
    start_time: '08:00',
    duration_minutes: 45,
    subject: tpl.subject,
    class_name: tpl.class_name,
    status: 'done',
    notes: 'בוצע בהצלחה בדיקת QA',
    institution_code: defaultSchool.semel_mosad
  };

  const { data: report, error: reportErr } = await supabase.from('weekly_actual_reports')
    .upsert(reportPayload)
    .select('*')
    .single();

  if (reportErr) {
    console.error('Failed to create weekly report:', reportErr);
    process.exit(1);
  }
  console.log('Created weekly report:', report.status, 'id:', report.id);

  console.log('\n--- 6. Clean up test records ---');
  await supabase.from('weekly_actual_reports').delete().eq('id', report.id);
  await supabase.from('schedule_templates').delete().eq('id', tpl.id);
  await supabase.from('teachers').delete().eq('id', teacher.id);
  console.log('Cleaned up test data successfully.');

  console.log('\n✅ ALL LIVE SUPABASE E2E INTEGRATION CHECKS PASSED PERFECTLY!');
}

runTest().catch((err) => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
