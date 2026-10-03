; 自定义 NSIS 脚本：仅注册函数，不修改 MUI 定义
; （MUI 定义由 electron-builder 模板控制，自定义注入会破坏生成）

Function CreateDesktopShortcut
  StrCmp $0 "1" 0 skip_ds
    CreateShortCut "$DESKTOP\ForgeExt.lnk" "$INSTDIR\ForgeExt.exe"
  skip_ds:
FunctionEnd
