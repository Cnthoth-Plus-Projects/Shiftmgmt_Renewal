import os
import shutil

staging_v4 = r"C:\Projects\Active\교대근무관리 시스템\.gdrive_staging\Active\교대근무관리 시스템\ShiftMgmt_V4"
if os.path.exists(staging_v4):
    shutil.rmtree(staging_v4)
os.makedirs(staging_v4, exist_ok=True)

v4_root = r"C:\Projects\Active\ShiftMgmt_V4"

# Folders to copy
dirs_to_copy = ['src', 'scripts', 'docs', 'test-fixtures', '양식샘플', 'data']
for d in dirs_to_copy:
    src_dir = os.path.join(v4_root, d)
    dst_dir = os.path.join(staging_v4, d)
    if os.path.exists(src_dir):
        shutil.copytree(src_dir, dst_dir)
        print(f"Copied dir: {d}")

# Files to copy
files_to_copy = [
    'package.json', 'package-lock.json', 'tsconfig.browser.json', 'tsconfig.server.json',
    'vitest.config.ts', 'vitest.setup.ts', 'eslint.config.mjs', 'README.md', 'VERSION', '.gitignore'
]
for f in files_to_copy:
    src_file = os.path.join(v4_root, f)
    dst_file = os.path.join(staging_v4, f)
    if os.path.exists(src_file):
        shutil.copy2(src_file, dst_file)
        print(f"Copied file: {f}")

# Create zip for ShiftMgmt_V4 source inside the root of 교대근무관리 시스템
zip_target = r"C:\Projects\Active\교대근무관리 시스템\.gdrive_staging\Active\교대근무관리 시스템\ShiftMgmt_V4_source"
shutil.make_archive(zip_target, 'zip', staging_v4)
zip_file = zip_target + ".zip"
print(f"Created zip: ShiftMgmt_V4_source.zip ({os.path.getsize(zip_file) / (1024*1024):.2f} MB)")
