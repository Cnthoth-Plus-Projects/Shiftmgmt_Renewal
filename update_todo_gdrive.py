import os
import sys
import json
import subprocess
import urllib.request
import urllib.error
import urllib.parse
import mimetypes
import shutil

def get_access_token():
    try:
        out = subprocess.check_output("gcloud auth print-access-token", shell=True)
        return out.decode().strip()
    except Exception as e:
        print(f"Error getting access token: {e}")
        return None

def drive_api_request(url, method="GET", data=None, headers=None, token=None):
    if headers is None:
        headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content_type = resp.headers.get("Content-Type", "")
            body = resp.read()
            if "application/json" in content_type:
                return json.loads(body.decode("utf-8"))
            return body
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        print(f"HTTPError {e.code} on {method} {url}: {err_msg}")
        raise

def main():
    token = get_access_token()
    if not token:
        print("Failed to obtain access token.")
        sys.exit(1)

    local_todo = r"C:\Projects\Active\교대근무관리 시스템\TODO.md"
    staging_todo = r"C:\Projects\Active\교대근무관리 시스템\.gdrive_staging\Active\교대근무관리 시스템\TODO.md"
    
    # 1. Update staging
    shutil.copy2(local_todo, staging_todo)
    print(f"Copied local TODO.md to staging ({os.path.getsize(staging_todo)} bytes)")

    # 2. Find folder '교대근무관리 시스템'
    # Active folder id: 1yOtOzMOkEvOZqDlL1_8QUL7ewUjyzz20
    # 교대근무관리 시스템 folder id: 1qz8U9xEO883GOSfY1B-7erKJVNKoiqHa
    parent_id = "1qz8U9xEO883GOSfY1B-7erKJVNKoiqHa"

    # 3. Search for TODO.md in this folder
    q = f"name = 'TODO.md' and '{parent_id}' in parents and trashed = false"
    url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id,name,webViewLink)"
    res = drive_api_request(url, token=token)
    files = res.get("files", [])

    with open(local_todo, "rb") as f:
        file_bytes = f.read()

    boundary = "-------314159265358979323846"
    headers = {
        "Content-Type": f"multipart/related; boundary={boundary}"
    }

    if files:
        file_id = files[0]["id"]
        print(f"Found existing TODO.md on Drive (ID: {file_id}). Updating...")
        upload_url = f"https://www.googleapis.com/upload/drive/v3/files/{file_id}?uploadType=multipart&fields=id,name,webViewLink,modifiedTime"
        metadata = {"name": "TODO.md"}
        method = "PATCH"
        action = "Updated"
    else:
        print(f"TODO.md not found in folder. Creating new...")
        upload_url = f"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,modifiedTime"
        metadata = {
            "name": "TODO.md",
            "parents": [parent_id]
        }
        method = "POST"
        action = "Created"

    body = (
        f"--{boundary}\r\n"
        f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{json.dumps(metadata)}\r\n"
        f"--{boundary}\r\n"
        f"Content-Type: text/markdown; charset=utf-8\r\n\r\n"
    ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

    result = drive_api_request(upload_url, method=method, data=body, headers=headers, token=token)
    print(f"\n==========================================")
    print(f"[{action}] TODO.md successfully replaced on Google Drive!")
    print(f"File ID: {result.get('id')}")
    print(f"Size: {len(file_bytes)} bytes")
    print(f"Drive Modified Time: {result.get('modifiedTime')}")
    print(f"WebViewLink: {result.get('webViewLink')}")
    print(f"==========================================")

    # 4. Also update local zip package
    zip_path = r"C:\Projects\Active\교대근무관리_시스템_Drive배포패키지"
    shutil.make_archive(zip_path, 'zip', r"C:\Projects\Active\교대근무관리 시스템\.gdrive_staging")
    print(f"Updated local zip package: {zip_path}.zip")

if __name__ == "__main__":
    main()
