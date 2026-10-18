#!/usr/bin/env python3
"""
Load Testing Script for Scool Record - Admin Login Endpoint
Designed to stress-test the /admin/login endpoint with concurrent users.
"""

import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Tuple

try:
    import requests
except ImportError:
    print("[ERROR] 'requests' module not found. Please install it using: pip install requests")
    sys.exit(1)

# Test Configuration
BASE_URL = os.environ.get("TARGET_BASE_URL", "http://localhost:3000")
ENDPOINT = "/admin/login"
TARGET_URL = f"{BASE_URL.rstrip('/')}{ENDPOINT}"
TOTAL_REQUESTS = 500
CONCURRENCY = 50
REQUEST_TIMEOUT = 10.0  # seconds


def send_single_request(request_id: int) -> Tuple[int, float, bool, str]:
    """
    Sends a single HTTP GET request to the target endpoint.
    Returns: (status_code, response_time_sec, is_success, error_message)
    """
    start_time = time.perf_counter()
    try:
        response = requests.get(TARGET_URL, timeout=REQUEST_TIMEOUT)
        latency = time.perf_counter() - start_time
        is_success = (response.status_code == 200)
        return response.status_code, latency, is_success, ""
    except requests.exceptions.RequestException as e:
        latency = time.perf_counter() - start_time
        return 0, latency, False, str(e)


def run_load_test():
    print("=" * 65)
    print(" 🚀 STARTING LOAD TEST: Scool Record /admin/login")
    print("=" * 65)
    print(f" Target Endpoint:   {TARGET_URL}")
    print(f" Total Requests:    {TOTAL_REQUESTS}")
    print(f" Concurrent Users:  {CONCURRENCY}")
    print(f" Timeout per req:   {REQUEST_TIMEOUT}s")
    print("-" * 65)
    print(" Sending requests in progress...")

    latencies: List[float] = []
    success_count = 0
    fail_count = 0
    status_codes_breakdown = {}

    overall_start_time = time.perf_counter()

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = [
            executor.submit(send_single_request, i) for i in range(TOTAL_REQUESTS)
        ]

        for future in as_completed(futures):
            status_code, latency, is_success, err_msg = future.result()
            latencies.append(latency)
            status_codes_breakdown[status_code] = status_codes_breakdown.get(status_code, 0) + 1

            if is_success:
                success_count += 1
            else:
                fail_count += 1

    total_execution_time = time.perf_counter() - overall_start_time

    # Calculations
    avg_latency = (sum(latencies) / len(latencies)) if latencies else 0.0
    min_latency = min(latencies) if latencies else 0.0
    max_latency = max(latencies) if latencies else 0.0
    sorted_latencies = sorted(latencies)
    p50_latency = sorted_latencies[int(len(sorted_latencies) * 0.50)] if sorted_latencies else 0.0
    p95_latency = sorted_latencies[int(len(sorted_latencies) * 0.95)] if sorted_latencies else 0.0
    rps = TOTAL_REQUESTS / total_execution_time if total_execution_time > 0 else 0.0

    print(" Done!")
    print("=" * 65)
    print(" 📊 LOAD TEST RESULTS SUMMARY")
    print("=" * 65)
    print(f" Total Execution Time:    {total_execution_time:.2f} seconds")
    print(f" Total Requests Sent:     {TOTAL_REQUESTS}")
    print(f" Successful Requests:     {success_count} (200 OK)")
    print(f" Failed Requests:         {fail_count}")
    print(f" Requests Per Second (RPS): {rps:.2f} req/s")
    print("-" * 65)
    print(" ⏱️  LATENCY METRICS:")
    print(f"   Average Response Time:  {avg_latency * 1000:.2f} ms ({avg_latency:.4f} s)")
    print(f"   Min Response Time:      {min_latency * 1000:.2f} ms")
    print(f"   Max Response Time:      {max_latency * 1000:.2f} ms")
    print(f"   Median (p50):           {p50_latency * 1000:.2f} ms")
    print(f"   95th Percentile (p95):  {p95_latency * 1000:.2f} ms")
    print("-" * 65)
    print(" 📋 STATUS CODES BREAKDOWN:")
    for code, count in sorted(status_codes_breakdown.items()):
        status_label = f"HTTP {code}" if code != 0 else "Connection/Timeout Error"
        percentage = (count / TOTAL_REQUESTS) * 100
        print(f"   {status_label:<25}: {count:>4} ({percentage:.1f}%)")
    print("=" * 65)


if __name__ == "__main__":
    run_load_test()
