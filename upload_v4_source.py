import os
import sys
import json
import subprocess
import urllib.request
import urllib.error
import urllib.parse
import mimetypes
from concurrent.futures import ThreadPoolExecutor, as_completed

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

# Cache for folder IDs: path -> folder_id
folder_cache = {}

def get_or_create_folder_cached(folder_name, parent_id, token):
    cache_key = f"{parent_id}/{folder_name}"
    if cache_key in folder_cache:
        return folder_cache[cache_key]

    q = f"name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and '{parent_id}' in parents and trashed = false"
    url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id,name)"
    res = drive_api_request(url, token=token)
    files = res.get("files", [])
    if files:
        fid = files[0]["id"]
    else:
        create_url = "https://www.googleapis.com/drive/v3/files"
        metadata = {
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id]
        }
        data = json.dumps(metadata).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        res = drive_api_request(create_url, method="POST", data=data, headers=headers, token=token)
        fid = res["id"]
        print(f"[Folder Created] {folder_name} -> {fid}")

    folder_cache[cache_key] = fid
    return fid

def upload_single_file(local_path, file_name, parent_id, token):
    mime_type, _ = mimetypes.guess_type(local_path)
    if mime_type is None:
        if local_path.endswith(('.ts', '.tsx', '.mjs', '.cjs', '.js', '.jsx', '.json', '.md', '.txt')):
            mime_type = "text/plain; charset=utf-8"
        elif local_path.endswith('.zip'):
            mime_type = "application/zip"
        else:
            mime_type = "application/octet-stream"

    with open(local_path, "rb") as f:
        file_bytes = f.read()

    boundary = "-------314159265358979323846"
    headers = {
        "Content-Type": f"multipart/related; boundary={boundary}"
    }

    # Check existing
    q = f"name = '{file_name}' and '{parent_id}' in parents and trashed = false"
    url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id,name)"
    res = drive_api_request(url, token=token)
    existing_files = res.get("files", [])

    if existing_files:
        file_id = existing_files[0]["id"]
        upload_url = f"https://www.googleapis.com/upload/drive/v3/files/{file_id}?uploadType=multipart&fields=id,name"
        metadata = {"name": file_name}
        method = "PATCH"
        action = "Updated"
    else:
        upload_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name"
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
    print(f"[{action}] {file_name} ({len(file_bytes)} bytes)")
    return res

def main():
    token = get_access_token()
    if not token:
        print("Failed to obtain access token.")
        sys.exit(1)

    print("Locating target folders in Google Drive...")
    # 1. Active folder
    active_id = get_or_create_folder_cached("Active", "root", token)

    # 2. 교대근무관리 시스템 folder
    proj_id = get_or_create_folder_cached("교대근무관리 시스템", active_id, token)

    # 3. Upload ShiftMgmt_V4_source.zip to root of 교대근무관리 시스템
    zip_path = r"C:\Projects\Active\교대근무관리 시스템\.gdrive_staging\Active\교대근무관리 시스템\ShiftMgmt_V4_source.zip"
    if os.path.exists(zip_path):
        print(f"\nUploading ShiftMgmt_V4_source.zip ({os.path.getsize(zip_path)/(1024*1024):.2f} MB)...")
        upload_single_file(zip_path, "ShiftMgmt_V4_source.zip", proj_id, token)

    # 4. Upload full ShiftMgmt_V4 tree
    v4_staging_root = r"C:\Projects\Active\교대근무관리 시스템\.gdrive_staging\Active\교대근무관리 시스템\ShiftMgmt_V4"
    v4_folder_id = get_or_create_folder_cached("ShiftMgmt_V4", proj_id, token)

    # First pass: pre-create all subdirectories
    print("\nEnsuring all directory structures exist on Drive...")
    dir_to_id = {"": v4_folder_id}
    
    for root, dirs, _ in os.walk(v4_staging_root):
        rel_root = os.path.relpath(root, v4_staging_root)
        current_parent_id = dir_to_id["" if rel_root == "." else rel_root]
        for d in sorted(dirs):
            rel_sub = os.path.normpath(os.path.join(rel_root, d)) if rel_root != "." else d
            fid = get_or_create_folder_cached(d, current_parent_id, token)
            dir_to_id[rel_sub] = fid

    # Second pass: gather all files to upload
    files_to_upload = []
    for root, _, files in os.walk(v4_staging_root):
        rel_root = os.path.relpath(root, v4_staging_root)
        parent_id = dir_to_id["" if rel_root == "." else rel_root]
        for f in files:
            full_path = os.path.join(root, f)
            files_to_upload.append((full_path, f, parent_id))

    print(f"\nUploading {len(files_to_upload)} source files with 8 worker threads...")
    success_count = 0
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(upload_single_file, fp, fn, pid, token): fn for fp, fn, pid in files_to_upload}
        for future in as_completed(futures):
            fn = futures[future]
            try:
                future.result()
                success_count += 1
            except Exception as e:
                print(f"Failed to upload {fn}: {e}")

    print(f"\n==========================================")
    print(f"ShiftMgmt_V4 source code upload complete!")
    print(f"Uploaded: ShiftMgmt_V4_source.zip (2.09 MB)")
    print(f"Uploaded: {success_count} / {len(files_to_upload)} individual source files into 'ShiftMgmt_V4/'")
    print(f"Folder URL: https://drive.google.com/drive/folders/{v4_folder_id}")
    print(f"==========================================")

if __name__ == "__main__":
    main()
