#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_installer.py
==================================================================
为「Scratch 扩展编辑器」构建 Windows 安装程序（NSIS）的 Python 脚本。

功能：
  1. 自动收集 0.3 版本所需的程序文件与依赖（electron 运行时 + 应用代码）。
  2. 定义安装路径、桌面/开始菜单快捷方式、版本号标识（0.3）与卸载入口。
  3. 生成可在目标 Windows 系统上双击运行的安装包 Setup-0.3.0.exe。

依赖：
  - Python 3.8+（仅标准库）
  - makensis.exe（NSIS 编译器，脚本会自动在常见位置 / electron-builder 缓存中查找）

使用：
  python build_installer.py                 # 使用下方 CONFIG 默认参数构建
  python build_installer.py --version 0.3.1 # 覆盖版本号
  python build_installer.py --source D:/myapp  --output out/
==================================================================
"""

import argparse
import glob
import os
import shutil
import subprocess
import sys
from pathlib import Path

# ==================================================================
# 一、参数配置区域（按需修改即可）
# ==================================================================
CONFIG = {
    # ---- 软件身份信息 ----
    "APP_NAME": "Scratch 扩展编辑器",          # 中文显示名（安装向导/开始菜单）
    "APP_NAME_EN": "scratch-extension-editor",  # 英文标识（目录/快捷方式文件名，避免非 ASCII 路径）
    "VERSION": "0.3.0",                         # 版本号标识
    "PUBLISHER": "dhdbvcg",                     # 发布者
    "APP_ID": "com.bilup.editor",               # 唯一标识（卸载注册表键名）

    # ---- 程序入口 ----
    "MAIN_EXE": "scratch-extension-editor.exe", # 安装后启动的主程序文件名

    # ---- 源文件（0.3 版本已构建好的程序文件与依赖）----
    # 默认指向 electron-builder 解包产物（含完整运行时 + 应用代码）。
    # 若你刚完成源码改动，请先执行 REBUILD_CMD 生成最新的 win-unpacked。
    "SOURCE_DIR": r"build/dist/win-unpacked",

    # 可选：在收集前重新构建 0.3 程序文件（留空则不执行）。
    # 例：在 build/ 目录运行 electron-builder --win --dir
    "REBUILD_CMD": "",

    # ---- 安装行为 ----
    "INSTALL_ROOT": r"$LOCALAPPDATA",   # 安装根目录（按用户隔离，免管理员权限）
    "ALLOW_DIR_CHANGE": "true",          # 安装时是否允许用户更改目录
    "REQUEST_LEVEL": "user",             # user=普通用户 / admin=需要管理员
    "CREATE_DESKTOP_SHORTCUT": True,
    "CREATE_STARTMENU_SHORTCUT": True,
    "RUN_AFTER_INSTALL": True,           # 安装完成页是否提供“运行”勾选

    # ---- 许可证（可选，留空则跳过许可证页）----
    "LICENSE_FILE": "",

    # ---- 输出 ----
    "OUTPUT_DIR": "installer_out",       # 安装包输出目录（相对脚本所在目录）
    "OUTPUT_NAME": "Setup-{version}.exe",# 安装包文件名模板

    # ---- 安装包图标 ----
    "ICON_FILE": r"build/favicon.ico",   # 安装向导/快捷方式图标（留空则使用主程序 exe 提取）

    # ---- 压缩 ----
    "COMPRESSOR": "lzma",                # lzma / zlib / bzip2

    # ---- NSIS 编译器查找（留空则自动探测）----
    "MAKENSIS_PATH": "",
}

# ==================================================================
# 二、工具函数
# ==================================================================

def log(msg: str) -> None:
    print(f"[build_installer] {msg}")


def resolve_path(base: Path, p: str) -> Path:
    """将相对路径按脚本目录解析为绝对路径。"""
    pp = Path(p)
    return pp if pp.is_absolute() else (base / pp)


def find_makensis(explicit: str) -> str:
    """查找 makensis.exe，返回绝对路径；找不到返回空串。"""
    if explicit:
        if os.path.isfile(explicit):
            return explicit
        log(f"指定的 makensis 不存在：{explicit}")

    # 1) PATH
    from shutil import which
    found = which("makensis") or which("makensis.exe")
    if found:
        return found

    # 2) 常见安装目录
    candidates = [
        r"C:/Program Files/NSIS/makensis.exe",
        r"C:/Program Files (x86)/NSIS/makensis.exe",
    ]
    # 3) electron-builder 缓存（多用户/版本通配）
    candidates += glob.glob(
        r"C:/Users/*/AppData/Local/electron-builder/Cache/nsis/*/makensis.exe"
    )
    candidates += glob.glob(
        r"C:/Users/*/AppData/Local/electron-builder/Cache/nsis/*/Bin/makensis.exe"
    )
    # 4) 当前用户缓存（精确）
    local = os.path.expandvars(
        r"%LOCALAPPDATA%/electron-builder/Cache/nsis/*/makensis.exe"
    )
    candidates += glob.glob(local)

    for c in candidates:
        if os.path.isfile(c):
            return c
    return ""


def collect_and_report(source_dir: Path) -> dict:
    """
    自动收集 0.3 程序文件与依赖，并统计清单。
    返回 {exists, file_count, total_bytes, main_exe_exists}
    """
    info = {
        "exists": source_dir.is_dir(),
        "file_count": 0,
        "total_bytes": 0,
        "main_exe_exists": False,
    }
    if not info["exists"]:
        return info

    main_exe = source_dir / CONFIG["MAIN_EXE"]
    info["main_exe_exists"] = main_exe.is_file()

    for root, _dirs, files in os.walk(source_dir):
        for f in files:
            fp = Path(root) / f
            try:
                info["file_count"] += 1
                info["total_bytes"] += fp.stat().st_size
            except OSError:
                pass
    return info


# ==================================================================
# 三、NSIS 脚本生成
# ==================================================================

def build_nsis_script(cfg: dict, source_dir: Path, out_file: Path, base: Path) -> str:
    """根据配置生成完整 NSIS 安装脚本字符串。"""
    # NSIS 路径统一用双反斜杠
    src_nsis = str(source_dir).replace("\\", "\\\\")
    icon_path = resolve_path(base, cfg["ICON_FILE"]) if cfg.get("ICON_FILE") else (source_dir / cfg["MAIN_EXE"])
    icon_nsis = str(icon_path).replace("\\", "\\\\")
    install_dir = f'{cfg["INSTALL_ROOT"]}\\{cfg["APP_NAME_EN"]}'
    request = "admin" if cfg["REQUEST_LEVEL"] == "admin" else "user"

    shortcuts = []
    if cfg["CREATE_DESKTOP_SHORTCUT"]:
        shortcuts.append(
            f'  CreateShortCut "$DESKTOP\\{cfg["APP_NAME_EN"]}.lnk" '
            f'"$INSTDIR\\{cfg["MAIN_EXE"]}"'
        )
    if cfg["CREATE_STARTMENU_SHORTCUT"]:
        shortcuts.append(
            f'  CreateDirectory "$SMPROGRAMS\\{cfg["APP_NAME_EN"]}"'
        )
        shortcuts.append(
            f'  CreateShortCut "$SMPROGRAMS\\{cfg["APP_NAME_EN"]}\\'
            f'{cfg["APP_NAME_EN"]}.lnk" "$INSTDIR\\{cfg["MAIN_EXE"]}"'
        )
        shortcuts.append(
            f'  CreateShortCut "$SMPROGRAMS\\{cfg["APP_NAME_EN"]}\\'
            f'卸载 {cfg["APP_NAME_EN"]}.lnk" "$INSTDIR\\uninstall.exe"'
        )
    shortcut_block = "\n".join(shortcuts) if shortcuts else "  ; 未创建快捷方式"

    pages = []
    if cfg["LICENSE_FILE"]:
        pages.append('  !insertmacro MUI_PAGE_LICENSE "%s"' % cfg["LICENSE_FILE"])
    pages.append("  !insertmacro MUI_PAGE_DIRECTORY" if cfg["ALLOW_DIR_CHANGE"] == "true"
                 else "  !insertmacro MUI_PAGE_DIRECTORY")
    pages.append("  !insertmacro MUI_PAGE_INSTFILES")
    if cfg["RUN_AFTER_INSTALL"]:
        pages.append('  !define MUI_FINISHPAGE_RUN "$INSTDIR\\%s"' % cfg["MAIN_EXE"])
        pages.append("  !insertmacro MUI_PAGE_FINISH")
    pages_block = "\n".join(pages)

    uninstall_entries = f'''  WriteUninstaller "$INSTDIR\\uninstall.exe"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{cfg['APP_ID']}" "DisplayName" "{cfg['APP_NAME']} {cfg['VERSION']}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{cfg['APP_ID']}" "DisplayVersion" "{cfg['VERSION']}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{cfg['APP_ID']}" "Publisher" "{cfg['PUBLISHER']}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{cfg['APP_ID']}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{cfg['APP_ID']}" "UninstallString" '"$INSTDIR\\uninstall.exe"'
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{cfg['APP_ID']}" "DisplayIcon" "$INSTDIR\\{cfg['MAIN_EXE']}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{cfg['APP_ID']}" "URLInfoAbout" "https://dhdbvcg.cc.cd"'''

    script = f'''; ------------------------------------------------------------------
; 自动生成的安装脚本 —— {cfg['APP_NAME']} {cfg['VERSION']}
; 由 build_installer.py 生成，请勿手动修改（改配置后重新运行脚本）
; ------------------------------------------------------------------
!include "MUI2.nsh"
Unicode true
SetCompressor /SOLID {cfg['COMPRESSOR']}

!define APP_NAME "{cfg['APP_NAME']}"
!define APP_NAME_EN "{cfg['APP_NAME_EN']}"
!define VERSION "{cfg['VERSION']}"
!define PUBLISHER "{cfg['PUBLISHER']}"
!define APP_ID "{cfg['APP_ID']}"
!define MAIN_EXE "{cfg['MAIN_EXE']}"
!define SOURCE_DIR "{src_nsis}"

Name "${{APP_NAME}} ${{VERSION}}"
OutFile "{str(out_file)}"
InstallDir "{install_dir}"
RequestExecutionLevel {request}

!define MUI_ABORTWARNING
!define MUI_ICON "{icon_nsis}"
!define MUI_UNICON "{icon_nsis}"

{pages_block}

; 安装区段
Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  ; 递归收集 0.3 程序文件与依赖
  File /r "${{SOURCE_DIR}}\\*.*"

  ; 快捷方式
{shortcut_block}

  ; 卸载入口与注册表信息
{uninstall_entries}

SectionEnd

; 卸载区段
Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\\${{APP_NAME_EN}}.lnk"
  RMDir /r "$SMPROGRAMS\\${{APP_NAME_EN}}"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${{APP_ID}}"
SectionEnd
'''
    return script


# ==================================================================
# 四、主流程
# ==================================================================

def main() -> int:
    parser = argparse.ArgumentParser(
        description="构建 Scratch 扩展编辑器 Windows 安装程序"
    )
    parser.add_argument("--version", help="覆盖版本号（如 0.3.1）")
    parser.add_argument("--source", help="覆盖源程序目录")
    parser.add_argument("--output", help="覆盖输出目录")
    parser.add_argument("--makensis", help="指定 makensis.exe 路径")
    args = parser.parse_args()

    # 合并配置
    cfg = dict(CONFIG)
    base = Path(__file__).resolve().parent
    if args.version:
        cfg["VERSION"] = args.version
    if args.source:
        cfg["SOURCE_DIR"] = args.source
    if args.output:
        cfg["OUTPUT_DIR"] = args.output
    if args.makensis:
        cfg["MAKENSIS_PATH"] = args.makensis

    log("=== 配置 ===")
    for k in ("APP_NAME", "VERSION", "APP_ID", "SOURCE_DIR", "OUTPUT_DIR"):
        log(f"  {k} = {cfg[k]}")

    source_dir = resolve_path(base, cfg["SOURCE_DIR"])
    output_dir = resolve_path(base, cfg["OUTPUT_DIR"])
    out_name = cfg["OUTPUT_NAME"].format(version=cfg["VERSION"])
    out_file = output_dir / out_name

    # 0) 可选：重新构建 0.3 程序文件
    if cfg["REBUILD_CMD"]:
        log(f"执行重建命令：{cfg['REBUILD_CMD']}")
        try:
            subprocess.run(cfg["REBUILD_CMD"], shell=True, check=True)
        except subprocess.CalledProcessError as e:
            log(f"重建失败：{e}")
            return 1

    # 1) 收集与校验
    log(f"收集程序文件：{source_dir}")
    info = collect_and_report(source_dir)
    if not info["exists"]:
        log(f"错误：源目录不存在：{source_dir}")
        return 1
    if not info["main_exe_exists"]:
        log(f"警告：主程序 {cfg['MAIN_EXE']} 未在源目录中找到，安装后仍可生成但无法启动。")
    size_mb = info["total_bytes"] / (1024 * 1024)
    log(f"已收集 {info['file_count']} 个文件，共 {size_mb:.1f} MB")

    # 2) 生成 NSIS 脚本
    output_dir.mkdir(parents=True, exist_ok=True)
    nsi_path = output_dir / "installer.nsi"
    script = build_nsis_script(cfg, source_dir, out_file, base)
    # 写 UTF-8 BOM，确保 makensis 以 UTF-8 正确解析含中文的脚本
    nsi_path.write_text(script, encoding="utf-8-sig")
    log(f"已生成 NSIS 脚本：{nsi_path}")

    # 3) 查找编译器
    makensis = find_makensis(cfg["MAKENSIS_PATH"])
    if not makensis:
        log("未找到 makensis.exe，无法生成安装包。")
        log("请安装 NSIS（https://nsis.sourceforge.io）或指定 --makensis 路径。")
        log(f"已为你生成 NSIS 脚本：{nsi_path}，可手动用 makensis 编译。")
        return 2
    log(f"使用 NSIS 编译器：{makensis}")

    # 4) 编译安装包
    log(f"正在生成安装包：{out_file}")
    try:
        proc = subprocess.run(
            [makensis, str(nsi_path)],
            capture_output=True, text=True, check=True,
        )
        # NSIS 输出较冗长，仅打印尾部
        tail = proc.stdout.strip().splitlines()[-8:]
        for line in tail:
            print(line)
    except subprocess.CalledProcessError as e:
        log("makensis 编译失败：")
        sys.stdout.write(e.stdout or "")
        sys.stderr.write(e.stderr or "")
        return 1

    if out_file.is_file():
        mb = out_file.stat().st_size / (1024 * 1024)
        log(f"✅ 安装包构建成功：{out_file}（{mb:.1f} MB）")
        return 0
    log("❌ 未找到生成的安装包，请检查 NSIS 输出。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
