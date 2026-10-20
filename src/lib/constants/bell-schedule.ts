export interface BellPreset {
  period_number: number;
  start_time: string;
  end_time: string;
  day_of_week: string;
}

export const DEFAULT_BELL_PRESETS: BellPreset[] = [
  { period_number: 1, start_time: '08:00', end_time: '08:45', day_of_week: 'all' },
  { period_number: 2, start_time: '08:50', end_time: '09:35', day_of_week: 'all' },
  { period_number: 3, start_time: '09:50', end_time: '10:35', day_of_week: 'all' },
  { period_number: 4, start_time: '10:40', end_time: '11:25', day_of_week: 'all' },
  { period_number: 5, start_time: '11:35', end_time: '12:20', day_of_week: 'all' },
  { period_number: 6, start_time: '12:25', end_time: '13:10', day_of_week: 'all' },
];

