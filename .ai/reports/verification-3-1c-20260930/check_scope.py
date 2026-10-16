import pathlib,re,hashlib,json,subprocess
control=pathlib.Path(r'C:/Projects/Active/교대근무관리 시스템')
repo=pathlib.Path(r'C:/Projects/Active/ShiftMgmt_V4')
text=(control/'HANDOFF.md').read_text(encoding='utf-8-sig')
part=text.split('## 10.')[1].split('## 회신')[0]
rows=[line.split('\t') for line in part.splitlines() if re.match(r'^[ MADRCU?!]{2} .+\t(?:[A-F0-9]{64}|ABSENT)$',line)]
baseline={state[3:]:(state[:2],sha) for state,sha in rows}
allowed={'src/web/screens/shell.ts','src/web/index.html','scripts/copy-web-assets.mjs'}
mismatch=[]
for relative,(status,expected) in baseline.items():
 p=repo/relative
 actual=hashlib.sha256(p.read_bytes()).hexdigest().upper() if p.is_file() else 'ABSENT'
 if relative not in allowed and actual != expected: mismatch.append({'path':relative,'expected':expected,'actual':actual})
gitout=subprocess.check_output(['git','-c','safe.directory=C:/Projects/Active/ShiftMgmt_V4','-c','core.quotepath=false','status','--short','--untracked-files=all'],cwd=repo).decode('utf-8').splitlines()
extra=[line[3:] for line in gitout if line[3:] not in baseline]
newfiles={'src/web/screens/home-model.ts','src/web/screens/home-model.test.ts','src/web/screens/home.ts','src/web/home.css','scripts/ui-checks/home.mjs'}
docs=[('12-능력-매트릭스.md','ED6D8ADC632C2D81A3CF60FDCF42BADA65A593369A3BA19562BF7B3E6F579794'),('11-디자인-요청서.md','B683DC2C760845CA14482DB4135E9C6B72DE097E7872116129BF7FEF399F4F73'),('10-화면설계-초안.md','DF99AF07C33F09DBE90410D255562891D73282132349ED8B35BC48156801CD08'),('시안/2026-09-06-최종정리/05-디자인-시스템-확정본-v1.3.md','0975102B82DFBCE518CAACDF94C79C84A5C7236BE4DCAA6728615192507535D4'),('시안/2026-09-06-최종정리/스냅샷-1차-승인본/03-home-1.html','C8042DC8797E90123CAAE5ABCBD29B493017C18BF81C750A06ADA43CA25BD1BF'),('시안/2026-09-06-최종정리/스냅샷-1차-승인본/03-home-2.html','A52EEB3627E7F224FF318909D711788A24D0341E2FC207EB41DC2C128EDFA259')]
docResults=[{'path':p,'match':hashlib.sha256((control/p).read_bytes()).hexdigest().upper()==sha} for p,sha in docs]
reported=set(re.findall(r'manifest: (artifacts/captures/phase3/\S+/manifest.json)',re.split(r'^## 회신\s*$',text,flags=re.M)[1]))
manifestFacts=[]
for p in (repo/'artifacts/captures/phase3').rglob('manifest.json'):
 if 'run-20260930-' not in p.as_posix(): continue
 data=json.loads(p.read_text(encoding='utf-8-sig'))
 manifestFacts.append({'path':p.relative_to(repo).as_posix(),'status':data.get('status'), 'reported':p.relative_to(repo).as_posix() in reported})
result={'baseline_count':len(rows),'baseline_status_sha':hashlib.sha256('\n'.join(row[0] for row in rows).encode()).hexdigest().upper(),'current_count':len(gitout),'current_status_sha':hashlib.sha256('\n'.join(gitout).encode()).hexdigest().upper(),'protected_count':len(baseline)-len(allowed),'protected_mismatch':mismatch,'new_paths_match':set(extra)==newfiles,'new_paths':extra,'source_docs':docResults,'reported_manifests':len(reported),'reported_manifest_statuses':[{m['path']:m['status']} for m in manifestFacts if m['reported']],'current_day_manifests':manifestFacts,'missing_failures':[m for m in manifestFacts if m['status']=='FAIL' and not m['reported']]}
out=control/'.ai/reports/verification-3-1c-20260930'
out.mkdir(exist_ok=True)
(out/'scope-evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='current_day_manifests'},ensure_ascii=False))
