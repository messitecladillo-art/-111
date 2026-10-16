param([Parameter(Mandatory=$true)][string]$Manifest,[Parameter(Mandatory=$true)][string]$Output,[ValidateSet('doc','xls')][string]$Kind='doc',[int]$Limit=1,[string]$Id='',[switch]$Child)
$ErrorActionPreference='Stop'
function Write-MaterialsReceipt([object]$Value,[string]$Path){
 $receiptTemporary=$Path+'.tmp'
 [IO.File]::WriteAllText($receiptTemporary,($Value | ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
 [IO.File]::Move($receiptTemporary,$Path,$true)
}
function Get-MaterialsWordContent([object]$Document){
 $taskContentRange=$Document.Content
 try{$taskRaw=[string]$taskContentRange.Text}finally{[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskContentRange) | Out-Null}
 $taskLines=$taskRaw.Split([char]13);$taskRecords=[Collections.Generic.List[object]]::new()
 for($taskLine=0;$taskLine -lt $taskLines.Length;$taskLine++){
  $taskText=$taskLines[$taskLine].Trim([char[]]@(7,13,10,32))
  if($taskText){$taskRecords.Add([ordered]@{ref=('document/content/line-'+($taskLine+1));text=$taskText;locator_schema='word-content-lines/v1'})}
 }
 return [pscustomobject]@{line_count=$taskLines.Length;records=$taskRecords.ToArray()}
}
function Assert-MaterialsUnlinkedPath([string]$AbsolutePath){
 $taskPathCursor=[IO.Path]::GetFullPath($AbsolutePath)
 while($taskPathCursor){
  if(Test-Path -LiteralPath $taskPathCursor){$taskPathItem=Get-Item -LiteralPath $taskPathCursor -Force;if(($taskPathItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Source/output reparse links are rejected'}}
  $taskPathParent=[IO.Path]::GetDirectoryName($taskPathCursor.TrimEnd('\'))
  if(-not $taskPathParent -or $taskPathParent -eq $taskPathCursor){break};$taskPathCursor=$taskPathParent
 }
}
$taskIndex=Get-Content -Raw -LiteralPath $Manifest -Encoding UTF8 | ConvertFrom-Json
$taskSourceRootAbsolute=[IO.Path]::GetFullPath($taskIndex.source_root).TrimEnd('\','/')
$taskOutputRoot=[IO.Path]::GetFullPath($Output).TrimEnd('\','/')
if($taskOutputRoot.Equals($taskSourceRootAbsolute,[StringComparison]::OrdinalIgnoreCase) -or $taskOutputRoot.StartsWith($taskSourceRootAbsolute+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Output must be outside the source tree; no output created'}
if(-not (Test-Path -LiteralPath $taskSourceRootAbsolute -PathType Container)){throw 'Source root must exist'}
Assert-MaterialsUnlinkedPath $taskSourceRootAbsolute
Assert-MaterialsUnlinkedPath $taskOutputRoot
New-Item -ItemType Directory -Force -Path $taskOutputRoot | Out-Null
$taskCandidates=@($taskIndex.entries | Where-Object { $_.status -eq 'blocked' -and $_.extension -eq ('.'+$Kind) })
$taskCandidates=@($taskCandidates | Where-Object {
 $receipt=Join-Path $taskOutputRoot ($_.id+'.receipt.json')
 if(-not (Test-Path -LiteralPath $receipt)){$true}else{
  $cached=Get-Content -Raw -LiteralPath $receipt -Encoding UTF8 | ConvertFrom-Json
  $validation=Join-Path $taskOutputRoot 'bulk-validation.json'
  $retryValidationOnly=$cached.status -eq 'error' -and $cached.error -eq 'Bulk Content.Text reader did not pass comparison; not accepted' -and (Test-Path -LiteralPath $validation) -and (Get-Content -Raw -LiteralPath $validation -Encoding UTF8 | ConvertFrom-Json).nonempty_sequence_exact_match
  if($retryValidationOnly){Write-MaterialsReceipt $cached (Join-Path $taskOutputRoot ($_.id+'.validation-rejected.receipt.json'));$true}else{$cached.status -notin @('extracted','timeout','error','no_text')}
 }
})
if($Id){$taskCandidates=@($taskCandidates | Where-Object id -eq $Id)}
if($Limit -gt 0){$taskCandidates=@($taskCandidates | Select-Object -First $Limit)}
if($Limit -eq 0 -and -not $Child){
 $taskHelperHost=(Get-Process -Id $PID).Path
 $taskHelperScript=$PSCommandPath
 foreach($taskEntry in $taskCandidates){
  $taskReceiptPath=Join-Path $taskOutputRoot ($taskEntry.id+'.receipt.json')
  $taskArgs=@('-NoLogo','-NoProfile','-NonInteractive','-File',('"'+$taskHelperScript+'"'),'-Manifest',('"'+[IO.Path]::GetFullPath($Manifest)+'"'),'-Output',('"'+$taskOutputRoot+'"'),'-Kind',$Kind,'-Id',$taskEntry.id,'-Limit','1','-Child')
  $taskStdout=Join-Path $taskOutputRoot ($taskEntry.id+'.stdout.log');$taskStderr=Join-Path $taskOutputRoot ($taskEntry.id+'.stderr.log')
  $taskLaunched=Get-Date
  $taskHelper=Start-Process -FilePath $taskHelperHost -ArgumentList $taskArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput $taskStdout -RedirectStandardError $taskStderr
  $taskFinished=$taskHelper.WaitForExit(45000)
  if(-not $taskFinished){
   if(Test-Path -LiteralPath $taskReceiptPath){$taskTimed=Get-Content -Raw -LiteralPath $taskReceiptPath -Encoding UTF8 | ConvertFrom-Json}else{$taskTimed=[pscustomobject]@{id=$taskEntry.id;sha256=$taskEntry.sha256;source_relative=$taskEntry.source_relative}}
   $taskTimed | Add-Member -NotePropertyName status -NotePropertyValue 'timeout' -Force
   $taskTimed | Add-Member -NotePropertyName watchdog_seconds -NotePropertyValue 45 -Force
   $taskTimed | Add-Member -NotePropertyName watchdog_helper_pid -NotePropertyValue $taskHelper.Id -Force
   if($taskTimed.own_pid){
    $taskTarget=Get-Process -Id ([int]$taskTimed.own_pid) -ErrorAction SilentlyContinue
    if($taskTarget -and $taskTarget.Path -eq ('C:\Program Files\Microsoft Office\Root\Office16\'+@{doc='WINWORD';xls='EXCEL'}[$Kind]+'.EXE') -and $taskTarget.StartTime -ge $taskLaunched.AddSeconds(-2) -and $taskTimed.helper_pid -eq $taskHelper.Id -and $taskTimed.owned_office_started_at -and $taskTarget.StartTime.ToUniversalTime().Ticks -eq ([datetime]$taskTimed.owned_office_started_at).ToUniversalTime().Ticks){
     $taskTimed | Add-Member -NotePropertyName terminated_owned_office -NotePropertyValue $true -Force
     Stop-Process -Id $taskTarget.Id -ErrorAction SilentlyContinue
    }else{$taskTimed | Add-Member -NotePropertyName office_termination_fence -NotePropertyValue 'not proven; left untouched' -Force}
   }
   Stop-Process -Id $taskHelper.Id -ErrorAction SilentlyContinue
   $taskTimed | Add-Member -NotePropertyName source_hash_after -NotePropertyValue (Get-FileHash -LiteralPath (Join-Path $taskIndex.source_root $taskEntry.source_relative) -Algorithm SHA256).Hash.ToLower() -Force
   $taskTimed | Add-Member -NotePropertyName source_unchanged -NotePropertyValue ($taskTimed.source_hash_after -eq $taskEntry.sha256) -Force
   Write-MaterialsReceipt $taskTimed $taskReceiptPath
   Write-Output ($taskTimed | ConvertTo-Json -Compress -Depth 10)
  }elseif(Test-Path -LiteralPath $taskReceiptPath){Get-Content -Raw -LiteralPath $taskReceiptPath -Encoding UTF8 | Write-Output}
  else{[ordered]@{id=$taskEntry.id;sha256=$taskEntry.sha256;source_relative=$taskEntry.source_relative;status='error';error='helper returned without a source receipt';helper_exit=$taskHelper.ExitCode;stderr=$taskStderr} | ConvertTo-Json | Set-Content -LiteralPath $taskReceiptPath -Encoding UTF8}
 }
 return
}
$taskProgram=@{doc='Word.Application';xls='Excel.Application'}[$Kind]; $taskProcessName=@{doc='WINWORD';xls='EXCEL'}[$Kind]
$taskClsId=(Get-Item -LiteralPath ('Registry::HKEY_CLASSES_ROOT\'+$taskProgram+'\CLSID')).GetValue('')
$taskServer=(Get-Item -LiteralPath ('Registry::HKEY_CLASSES_ROOT\CLSID\'+$taskClsId+'\LocalServer32')).GetValue('')
if($taskServer -notmatch '^C:\\Program Files\\Microsoft Office\\Root\\Office16\\(WINWORD|EXCEL)\.EXE\s+/AUTOMATION$'){throw 'Unverified official Office registry target'}
$taskExisting=@(Get-Process -Name $taskProcessName -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class MaterialsOfficeWindow{[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr window,out uint processId);}'
$taskOffice=$null; $taskOwnPid=0; $taskOldUpdateLinks=$null
try{
 $taskOffice=New-Object -ComObject $taskProgram; [uint32]$taskOfficePid=0
 if($taskOffice.Hwnd){[MaterialsOfficeWindow]::GetWindowThreadProcessId([IntPtr]$taskOffice.Hwnd,[ref]$taskOfficePid) | Out-Null}else{$taskFresh=@(Get-Process -Name $taskProcessName -ErrorAction SilentlyContinue | Where-Object { $taskExisting -notcontains $_.Id });if($taskFresh.Count -eq 1 -and $taskFresh[0].Path -match '^C:\\Program Files\\Microsoft Office\\Root\\Office16\\WINWORD.EXE$'){$taskOfficePid=[uint32]$taskFresh[0].Id}}
 if($taskOfficePid -eq 0 -or $taskExisting -contains [int]$taskOfficePid){throw 'Office instance PID isolation failed; do not quit any pre-existing process'}
 $taskOwnPid=[int]$taskOfficePid; $taskOffice.AutomationSecurity=3
 if($taskOffice.AutomationSecurity -ne 3){throw 'Macro disable unsupported'}
 $taskOffice.Visible=$false
 if($Kind -eq 'doc'){$taskOffice.DisplayAlerts=0;$taskOldUpdateLinks=$taskOffice.Options.UpdateLinksAtOpen;$taskOffice.Options.UpdateLinksAtOpen=$false;if($taskOffice.Options.UpdateLinksAtOpen){throw 'External link suppression failed'}}
 else{$taskOffice.DisplayAlerts=$false;$taskOffice.AskToUpdateLinks=$false}
 foreach($taskEntry in $taskCandidates){
  $taskStarted=Get-Date; $taskSource=[IO.Path]::GetFullPath((Join-Path $taskIndex.source_root $taskEntry.source_relative));$taskSourceRoot=[IO.Path]::GetFullPath($taskIndex.source_root).TrimEnd('\')+'\'
  if(-not $taskSource.StartsWith($taskSourceRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Source outside named root'}
  Assert-MaterialsUnlinkedPath $taskSource
  if((Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash.ToLower() -ne $taskEntry.sha256){throw 'Source hash mismatch'}
  $taskReceipt=[ordered]@{id=$taskEntry.id;sha256=$taskEntry.sha256;source_relative=$taskEntry.source_relative;extension=$taskEntry.extension;engine=$taskProgram;own_pid=$taskOwnPid;owned_office_started_at=(Get-Process -Id $taskOwnPid).StartTime.ToUniversalTime().ToString('o');helper_pid=$PID;readonly=$true;automation_security=3;source_save=$false;status='running';started_at=$taskStarted.ToUniversalTime().ToString('o')}
  $taskReceiptPath=Join-Path $taskOutputRoot ($taskEntry.id+'.receipt.json');Write-MaterialsReceipt $taskReceipt $taskReceiptPath
  $taskDocument=$null;$taskWriter=$null
  try{
   $taskTextName=$taskEntry.sha256+'.jsonl';$taskTextPath=Join-Path $taskOutputRoot $taskTextName;$taskWriter=[IO.StreamWriter]::new($taskTextPath,$false,[Text.UTF8Encoding]::new($false));$taskCount=0;$taskChars=0
   if($Kind -eq 'doc'){
    $taskDocument=$taskOffice.Documents.Open($taskSource,$false,$true,$false);if(-not $taskDocument.ReadOnly){throw 'Word readonly assertion failed'}
    $taskBulk=Get-MaterialsWordContent $taskDocument
    $taskValidationPath=Join-Path $taskOutputRoot 'bulk-validation.json'
    if(-not (Test-Path -LiteralPath $taskValidationPath) -or -not (Get-Content -Raw -LiteralPath $taskValidationPath -Encoding UTF8 | ConvertFrom-Json).nonempty_sequence_exact_match){
     # First-run probe uses this actual DOC and the same isolated readonly instance.
     # Word table paragraph ranges can contain multiple CR-delimited content lines.
     $taskBaselineName=$taskEntry.sha256+'.paragraph-validation.jsonl'
     $taskBaselineWriter=[IO.StreamWriter]::new((Join-Path $taskOutputRoot $taskBaselineName),$false,[Text.UTF8Encoding]::new($false))
     $taskBaselineRecords=[Collections.Generic.List[string]]::new();$taskProbeBody=$null;$taskProbeParagraphs=$null
     try{
      $taskProbeBody=$taskDocument.Content;$taskProbeParagraphs=$taskProbeBody.Paragraphs
      for($taskParagraph=1;$taskParagraph -le $taskProbeParagraphs.Count;$taskParagraph++){
       $taskPara=$null;$taskRange=$null
       try{
        $taskPara=$taskProbeParagraphs.Item($taskParagraph);$taskRange=$taskPara.Range;$taskProbeText=([string]$taskRange.Text).Trim([char[]]@(7,13,10,32))
        if($taskProbeText){$taskBaselineRecords.Add($taskProbeText);$taskBaselineWriter.WriteLine(([ordered]@{ref=('document/body/paragraph-'+$taskParagraph);text=$taskProbeText;locator_schema='word-body-paragraphs/v1'} | ConvertTo-Json -Compress))}
       }finally{if($taskRange){[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskRange) | Out-Null};if($taskPara){[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskPara) | Out-Null}}
      }
     }finally{$taskBaselineWriter.Dispose();if($taskProbeParagraphs){[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskProbeParagraphs) | Out-Null};if($taskProbeBody){[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskProbeBody) | Out-Null}}
     $taskBaseline=@($taskBaselineRecords | ForEach-Object {([string]$_).Split([char]13) | ForEach-Object {$line=([string]$_).Trim([char[]]@(7,13,10,32));if($line){$line}}})
     $taskSame=$taskBaseline.Count -eq $taskBulk.records.Count
     if($taskSame){for($taskI=0;$taskI -lt $taskBaseline.Count;$taskI++){if($taskBaseline[$taskI] -cne $taskBulk.records[$taskI].text){$taskSame=$false;break}}}
     $taskValidation=[ordered]@{schema='word-content-lines/v1';validation_mode='same-document-inline-first-run';probe_id=$taskEntry.id;probe_sha256=$taskEntry.sha256;baseline_locator_schema='word-body-paragraphs/v1';baseline_text_file=$taskBaselineName;baseline_text_sha256=(Get-FileHash -LiteralPath (Join-Path $taskOutputRoot $taskBaselineName) -Algorithm SHA256).Hash.ToLower();baseline_records=$taskBaselineRecords.Count;baseline_flattened_lines=$taskBaseline.Count;comparison='same CR split and trim on both sides; table paragraph records can contain CR';content_records=$taskBulk.records.Count;nonempty_sequence_exact_match=$taskSame;own_pid=$taskOwnPid;automation_security=3;external_links_update='disabled before open';readonly=$true;source_save=$false;validated_at=(Get-Date).ToUniversalTime().ToString('o')}
     $taskValidation['source_hash_after']=(Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash.ToLower();$taskValidation['source_unchanged']=$taskValidation.source_hash_after -eq $taskEntry.sha256
     Write-MaterialsReceipt $taskValidation $taskValidationPath
    }
    $taskValidated=Get-Content -Raw -LiteralPath $taskValidationPath -Encoding UTF8 | ConvertFrom-Json
    if(-not $taskValidated.nonempty_sequence_exact_match -or -not $taskValidated.source_unchanged -or $taskValidated.schema -ne 'word-content-lines/v1'){throw 'Bulk Content.Text reader did not pass comparison; not accepted'}
    foreach($taskRecord in $taskBulk.records){$taskWriter.WriteLine(($taskRecord | ConvertTo-Json -Compress));$taskCount++;$taskChars+=$taskRecord.text.Length}
    $taskReceipt['locator_schema']='word-content-lines/v1';$taskReceipt['content_lines']=$taskBulk.line_count;$taskReceipt['reader_validation']='bulk-validation.json';$taskReceipt['external_links_update']='disabled before open';$taskReceipt['unread_embedded_objects']='Body Content.Text only; images, embedded objects, headers and footers are not claimed read'
   }else{
    $taskDocument=$taskOffice.Workbooks.Open($taskSource,0,$true);if(-not $taskDocument.ReadOnly){throw 'Excel readonly assertion failed'};$taskSheets=@()
    foreach($taskSheet in $taskDocument.Worksheets){$taskSheets+=[string]$taskSheet.Name;$taskUsed=$taskSheet.UsedRange
     foreach($taskCell in $taskUsed.Cells){$taskText=[string]$taskCell.Text;if($taskText){$taskWriter.WriteLine(([ordered]@{ref=([string]$taskSheet.Name+'!'+$taskCell.Address($false,$false));text=$taskText;formula=[string]$taskCell.Formula} | ConvertTo-Json -Compress));$taskCount++;$taskChars+=$taskText.Length};[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskCell) | Out-Null}
     [Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskUsed) | Out-Null;[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskSheet) | Out-Null
    };$taskReceipt['sheets']=$taskSheets;$taskReceipt['external_links_update']='Workbooks.Open UpdateLinks=0'
   }
   $taskWriter.Dispose();$taskWriter=$null;$taskReceipt['status']=if($taskCount){'extracted'}else{'no_text'};$taskReceipt['records']=$taskCount;$taskReceipt['text_chars']=$taskChars;$taskReceipt['text_file']=$taskTextName;$taskReceipt['text_sha256']=(Get-FileHash -LiteralPath $taskTextPath -Algorithm SHA256).Hash.ToLower()
  }catch{$taskReceipt['status']='error';$taskReceipt['error']=$_.Exception.Message}
  finally{if($taskWriter){$taskWriter.Dispose()};if($taskDocument){if($Kind -eq 'doc'){$taskDocument.Close(0)}else{$taskDocument.Close($false)};[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskDocument) | Out-Null}}
  $taskReceipt['source_hash_after']=(Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash.ToLower();$taskReceipt['source_unchanged']=$taskReceipt.source_hash_after -eq $taskEntry.sha256;if(-not $taskReceipt.source_unchanged){throw 'Source mutation detected'}
  $taskReceipt['elapsed_seconds']=[math]::Round(((Get-Date)-$taskStarted).TotalSeconds,3);$taskReceipt['finished_at']=(Get-Date).ToUniversalTime().ToString('o');Write-MaterialsReceipt $taskReceipt $taskReceiptPath
  Write-Output ($taskReceipt | ConvertTo-Json -Compress -Depth 10)
 }
}finally{if($taskOffice){if($taskOwnPid -gt 0){try{if($Kind -eq 'doc' -and $null -ne $taskOldUpdateLinks){$taskOffice.Options.UpdateLinksAtOpen=$taskOldUpdateLinks};$taskOffice.Quit()}catch{Write-Warning 'Own Office instance already unavailable during cleanup'}};[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskOffice) | Out-Null};[GC]::Collect();[GC]::WaitForPendingFinalizers()}




