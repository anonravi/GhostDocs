import requests
import json

BASE_URL = "http://127.0.0.1:8000"

def test_generate():
    payload = {
        "repo_name": "ravi/GhostDocs",
        "commit_sha": "abcdef1234567890"
    }
    response = requests.post(f"{BASE_URL}/generate", json=payload)
    print("Generate Status:", response.status_code)
    print("Response:", response.json())
    return response.json().get("id")

def test_list_jobs():
    response = requests.get(f"{BASE_URL}/jobs")
    print("List Jobs Status:", response.status_code)
    print("Jobs:", response.json())

if __name__ == "__main__":
    job_id = test_generate()
    if job_id:
        test_list_jobs()
