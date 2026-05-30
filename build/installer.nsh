; Checks for the VC++ 2015-2022 Redistributable (x64) and installs it if missing.
;
; Before running "npm run build:win", download vcredist_x64.exe and place it in this
; directory (build/vcredist_x64.exe):
;   https://aka.ms/vs/17/release/vc_redist.x64.exe

!macro customInstall
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 <> 1
    DetailPrint "Installing Visual C++ 2015-2022 Redistributable..."
    File "/oname=$PLUGINSDIR\vcredist_x64.exe" "${BUILD_RESOURCES_DIR}\vcredist_x64.exe"
    ExecWait '"$PLUGINSDIR\vcredist_x64.exe" /install /quiet /norestart' $0
    ${If} $0 <> 0
    ${AndIf} $0 <> 3010
      MessageBox MB_OK|MB_ICONWARNING "Visual C++ Redistributable installation returned code $0. TopoCrafter may not run correctly."
    ${EndIf}
  ${EndIf}
!macroend
