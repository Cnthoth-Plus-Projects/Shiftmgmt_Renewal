import os
import sys
import json
import subprocess
import urllib.request
import urllib.error
import mimetypes

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

def find_or_create_folder(folder_name, parent_id, token):
    q = f"name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and '{parent_id}' in parents and trashed = false"
    url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id,name,webViewLink)"
    res = drive_api_request(url, token=token)
    files = res.get("files", [])
    if files:
        print(f"Found existing folder '{folder_name}' (ID: {files[0]['id']})")
        return files[0]["id"], files[0].get("webViewLink", "")
    
    # Create folder
    create_url = "https://www.googleapis.com/drive/v3/files"
    metadata = {
        "name": folder_name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id]
    }
    data = json.dumps(metadata).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    res = drive_api_request(create_url, method="POST", data=data, headers=headers, token=token)
    print(f"Created folder '{folder_name}' (ID: {res['id']})")
    return res["id"], res.get("webViewLink", "")

def upload_file(local_path, file_name, parent_id, token):
    # Check if already exists in parent
    q = f"name = '{file_name}' and '{parent_id}' in parents and trashed = false"
    url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id,name)"
    res = drive_api_request(url, token=token)
    existing_files = res.get("files", [])

    mime_type, _ = mimetypes.guess_type(local_path)
    if mime_type is None:
        mime_type = "text/plain; charset=utf-8" if local_path.endswith(('.md', '.json', '.txt', '.mjs', '.ts', '.js')) else "application/octet-stream"

    with open(local_path, "rb") as f:
        file_bytes = f.read()

    boundary = "-------314159265358979323846"
    headers = {
        "Content-Type": f"multipart/related; boundary={boundary}"
    }

    if existing_files:
        # Update existing
        file_id = existing_files[0]["id"]
        upload_url = f"https://www.googleapis.com/upload/drive/v3/files/{file_id}?uploadType=multipart&fields=id,name,webViewLink"
        metadata = {"name": file_name}
        method = "PATCH"
        action = "Updated"
    else:
        # Create new
        upload_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink"
        metadata = {
            "name": file_name,
            "parents": [parent_id]
        }
        method = "POST"
        action = "Uploaded"

    body = (
        f"--{boundary}\r\n"
        f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{json.dumps(metadata)}\r\n"
        f"--{boundary}\r\n"
        f"Content-Type: {mime_type}\r\n\r\n"
    ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

    res = drive_api_request(upload_url, method=method, data=body, headers=headers, token=token)
    print(f"[{action}] {file_name} ({len(file_bytes)} bytes) -> ID: {res['id']}")
    return res

def main():
    token = get_access_token()
    if not token:
        print("Failed to obtain access token.")
        sys.exit(1)

    print("Verifying Drive API access...")
    try:
        drive_api_request("https://www.googleapis.com/drive/v3/files?pageSize=1", token=token)
        print("Drive API access confirmed!")
    except Exception as e:
        print("Drive API permission check failed. Please ensure Drive access is enabled.")
        sys.exit(1)

    # 1. Active folder under root
    active_folder_id, _ = find_or_create_folder("Active", "root", token)

    # 2. 교대근무관리 시스템 folder under Active
    proj_folder_id, proj_link = find_or_create_folder("교대근무관리 시스템", active_folder_id, token)

    # 3. Subfolders under 교대근무관리 시스템
    docs_folder_id, _ = find_or_create_folder("docs", proj_folder_id, token)
    arch_folder_id, _ = find_or_create_folder("architecture", proj_folder_id, token)

    staging_root = r"C:\Projects\Active\교대근무관리 시스템\.gdrive_staging\Active\교대근무관리 시스템"
    
    upload_count = 0
    # Walk through staging files
    for root, dirs, files in os.walk(staging_root):
        rel_dir = os.path.relpath(root, staging_root)
        if rel_dir == ".":
            target_parent = proj_folder_id
        elif rel_dir == "docs":
            target_parent = docs_folder_id
        elif rel_dir == "architecture":
            target_parent = arch_folder_id
        else:
            sub_id, _ = find_or_create_folder(rel_dir, proj_folder_id, token)
            target_parent = sub_id

        for fname in sorted(files):
            fpath = os.path.join(root, fname)
            upload_file(fpath, fname, target_parent, token)
            upload_count += 1

    print(f"\n==========================================")
    print(f"Total {upload_count} files successfully uploaded to Google Drive!")
    print(f"Folder: Active / 교대근무관리 시스템")
    print(f"Folder Link: {proj_link}")
    print(f"==========================================")

if __name__ == "__main__":
    main()
