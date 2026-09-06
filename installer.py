#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
installer.py —— 鼠大侠风格 Python GUI 安装程序
====================================================
纯 tkinter 实现，无需第三方依赖。
功能：自定义窗口 / 绿色主题 / 协议勾选 / 桌面快捷方式 /
      一键安装（文件收集+复制+注册表+卸载入口）/
      进度条 / 安装完成页

使用：
  python installer.py                     # 直接运行安装
  python installer.py --source D:/app     # 指定源目录
  python installer.py --version 0.3.1     # 覆盖版本号

打包为独立 exe（推荐）：
  pip install pyinstaller
  pyinstaller --onefile --windowed --name "Setup-0.3.0" installer.py
====================================================
"""

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

# ==================================================================
# 一、参数配置区域（按需修改）
# ==================================================================
CONFIG = {
    # ---- 软件身份 ----
    "APP_NAME": "Scratch 扩展编辑器",          # 中文显示名
    "APP_NAME_EN": "scratch-extension-editor",  # 英文标识（目录/文件名）
    "SUBTITLE": "Bilup 编辑器",                 # 品牌副标题
    "VERSION": "0.3.0",                         # 版本号
    "PUBLISHER": "dhdbvcg",                     # 发布者
    "APP_ID": "com.bilup.editor",               # 卸载注册表键名
    "WEBSITE": "https://dhdbvcg.cc.cd",         # 官网

    # ---- 程序文件 ----
    "MAIN_EXE": "scratch-extension-editor.exe",
    "SOURCE_DIR": r"build\dist\win-unpacked",   # 0.3 程序文件源目录

    # ---- 安装目标 ----
    "INSTALL_DIR_NAME": "scratch-extension-editor",  # 安装子目录名
    # 安装到 %LOCALAPPDATA% 下（免管理员权限）

    # ---- 颜色主题（鼠大侠绿）----
    "COLOR_PRIMARY": "#43A047",       # 主绿色（标题栏/按钮/品牌区）
    "COLOR_PRIMARY_DARK": "#2E7D32",  # 深绿（按钮悬停/按下）
    "COLOR_PRIMARY_LIGHT": "#81C784", # 浅绿（品牌区渐变）
    "COLOR_BG": "#FFFFFF",           # 内容区背景
    "COLOR_TEXT": "#333333",         # 主文字
    "COLOR_TEXT_LIGHT": "#757575",   # 副文字/副标题
    "COLOR_LINK": "#1976D2",         # 链接蓝
    "COLOR_BORDER": "#E0E0E0",       # 边框

    # ---- 窗口 ----
    "WINDOW_WIDTH": 480,
    "WINDOW_HEIGHT": 580,

    # ---- 图标 ----
    "ICON_FILE": r"build\favicon.ico",  # 窗口/快捷方式图标
}

# ==================================================================
# 二、tkinter 导入与兼容
# ==================================================================
try:
    import tkinter as tk
    from tkinter import ttk, messagebox, filedialog
except ImportError:
    print("错误：需要 tkinter 支持。请安装 python-tk 或使用带 tkinter 的 Python 发行版。")
    sys.exit(1)

# Windows 特有：注册表操作
try:
    import winreg
    HAS_WINREG = True
except ImportError:
    HAS_WINREG = False

# ==================================================================
# 三、工具函数
# ==================================================================

def resolve(p: str) -> Path:
    """相对路径按脚本/程序所在目录解析（兼容 PyInstaller 打包后的 exe）。"""
    pp = Path(p)
    if pp.is_absolute():
        return pp
    # PyInstaller 冻结后 __file__ 指向临时解压目录，用 sys.executable 取 exe 实际位置
    if getattr(sys, "frozen", False):
        base = Path(sys.executable).resolve().parent
    else:
        base = Path(__file__).resolve().parent
    return base / pp


def get_install_root() -> Path:
    """返回安装根目录（%LOCALAPPDATA%）。"""
    appdata = os.environ.get("LOCALAPPDATA")
    if appdata:
        return Path(appdata)
    return Path.home() / "AppData" / "Local"


def count_files(directory: Path) -> tuple:
    """统计目录下文件数和总字节。"""
    total = 0
    count = 0
    for root, _dirs, files in os.walk(directory):
        for f in files:
            count += 1
            try:
                total += (Path(root) / f).stat().st_size
            except OSError:
                pass
    return count, total


def create_shortcut(target: Path, shortcut_path: Path, icon: str = "") -> bool:
    """用 PowerShell 创建 .lnk 快捷方式。"""
    ps_script = (
        f'$ws = New-Object -ComObject WScript.Shell;\n'
        f'$sc = $ws.CreateShortcut("{shortcut_path}");\n'
        f'$sc.TargetPath = "{target}";\n'
        f'$sc.WorkingDirectory = "{target.parent}";\n'
    )
    if icon and os.path.isfile(icon):
        ps_script += f'$sc.IconLocation = "{icon},0";\n'
    ps_script += "$sc.Save();"
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=True, timeout=15,
        )
        return shortcut_path.exists()
    except Exception:
        return False


def write_uninstall_registry(install_dir: Path, cfg: dict) -> None:
    """写入卸载注册表项。"""
    if not HAS_WINREG:
        return
    try:
        key = winreg.CreateKeyEx(
            winreg.HKEY_CURRENT_USER,
            rf"Software\Microsoft\Windows\CurrentVersion\Uninstall\{cfg['APP_ID']}",
            0, winreg.KEY_SET_VALUE,
        )
        values = {
            "DisplayName": f"{cfg['APP_NAME']} {cfg['VERSION']}",
            "DisplayVersion": cfg["VERSION"],
            "Publisher": cfg["PUBLISHER"],
            "InstallLocation": str(install_dir),
            "UninstallString": f'"{install_dir / "uninstaller.pyw"}"',
            "DisplayIcon": f"{install_dir / cfg['MAIN_EXE']}",
            "URLInfoAbout": cfg["WEBSITE"],
        }
        for k, v in values.items():
            winreg.SetValueEx(key, k, 0, winreg.REG_SZ, v)
        winreg.CloseKey(key)
    except OSError:
        pass


def generate_uninstaller(install_dir: Path, cfg: dict) -> None:
    """生成 uninstaller.pyw 到安装目录，供卸载时调用。"""
    uninstaller_code = f'''#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""{cfg['APP_NAME']} 卸载程序 —— 由 installer.py 自动生成"""
import os, shutil, sys
from pathlib import Path

INSTALL_DIR = r"{install_dir}"
APP_ID = "{cfg['APP_ID']}"
APP_NAME_EN = "{cfg['APP_NAME_EN']}"

def main():
    d = Path(INSTALL_DIR)
    if d.is_dir():
        shutil.rmtree(d, ignore_errors=True)
    # 删除快捷方式
    desktop = Path.home() / "Desktop" / f"{{APP_NAME_EN}}.lnk"
    if desktop.exists(): desktop.unlink()
    startmenu = Path(os.environ.get("APPDATA", "")) / \
        "Microsoft/Windows/Start Menu/Programs" / APP_NAME_EN
    if startmenu.is_dir(): shutil.rmtree(startmenu, ignore_errors=True)
    # 删除注册表
    try:
        import winreg
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER,
            f"Software/Microsoft/Windows/CurrentVersion/Uninstall/{{APP_ID}}")
    except Exception:
        pass
    print("卸载完成")

if __name__ == "__main__":
    main()
'''
    (install_dir / "uninstaller.pyw").write_text(uninstaller_code, encoding="utf-8")


# ==================================================================
# 四、自定义窗口基类（无边框 + 可拖拽 + 圆角效果）
# ==================================================================

class InstallerWindow(tk.Tk):
    """鼠大侠风格安装程序主窗口。"""

    def __init__(self, cfg: dict, source_dir: Path):
        super().__init__()
        self.cfg = cfg
        self.source_dir = source_dir
        self.install_dir = get_install_root() / cfg["INSTALL_DIR_NAME"]

        # 窗口属性
        self.title(f"安装 {cfg['APP_NAME']}")
        self.geometry(f"{cfg['WINDOW_WIDTH']}x{cfg['WINDOW_HEIGHT']}")
        self.resizable(False, False)
        self.configure(bg=cfg["COLOR_BG"])

        # 无边框 + 任务栏图标
        self.overrideredirect(True)
        icon_path = resolve(cfg.get("ICON_FILE", ""))
        if icon_path.exists():
            try:
                self.iconbitmap(str(icon_path))
            except Exception:
                pass

        # 居中显示
        self.update_idletasks()
        w = cfg["WINDOW_WIDTH"]
        h = cfg["WINDOW_HEIGHT"]
        x = (self.winfo_screenwidth() - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

        # 拖拽状态
        self._drag_data = {"x": 0, "y": 0}

        # 构建UI
        self._build_ui()

        # 绑定拖拽
        self.title_bar.bind("<ButtonPress-1>", self._start_drag)
        self.title_bar.bind("<B1-Motion>", self._on_drag)
        self.brand_area.bind("<ButtonPress-1>", self._start_drag)
        self.brand_area.bind("<B1-Motion>", self._on_drag)

        # 绑定窗口按钮
        self.btn_minimize.bind("<Button-1>", lambda e: self.iconify())
        self.btn_close.bind("<Button-1>", lambda e: self.destroy())
        self.btn_close.bind("<Enter>", lambda e: self.btn_close.configure(
            bg="#E53935", fg="white"))
        self.btn_close.bind("<Leave>", lambda e: self.btn_close.configure(
            bg=cfg["COLOR_PRIMARY"], fg="white"))

    # ---- 拖拽 ----
    def _start_drag(self, event):
        self._drag_data["x"] = event.x
        self._drag_data["y"] = event.y

    def _on_drag(self, event):
        dx = event.x - self._drag_data["x"]
        dy = event.y - self._drag_data["y"]
        x = self.winfo_x() + dx
        y = self.winfo_y() + dy
        self.geometry(f"+{x}+{y}")

    # ---- UI 构建 ----
    def _build_ui(self):
        cfg = self.cfg
        c = cfg["COLOR_PRIMARY"]
        cd = cfg["COLOR_PRIMARY_DARK"]
        cl = cfg["COLOR_PRIMARY_LIGHT"]

        # ====== 1. 标题栏 ======
        self.title_bar = tk.Frame(self, bg=c, height=36)
        self.title_bar.pack(fill="x")
        self.title_bar.pack_propagate(False)

        # 左：图标 + 标题文字
        title_left = tk.Frame(self.title_bar, bg=c)
        title_left.pack(side="left", padx=12, pady=0)

        # 小图标（用文字 emoji 占位，有 ico 文件时可用 PhotoImage）
        self.lbl_icon = tk.Label(
            title_left, text="🧩", font=("Segoe UI Emoji", 14),
            bg=c, fg="white"
        )
        self.lbl_icon.pack(side="left", padx=(0, 8))

        self.lbl_title = tk.Label(
            title_left, text=f"安装 {cfg['APP_NAME']}",
            font=("Microsoft YaHei UI", 11), bg=c, fg="white"
        )
        self.lbl_title.pack(side="left")

        # 右：最小化 / 关闭
        btn_frame = tk.Frame(self.title_bar, bg=c)
        btn_frame.pack(side="right", padx=4)

        self.btn_minimize = tk.Label(
            btn_frame, text="─", font=("Segoe UI", 12),
            bg=c, fg="white", width=3, cursor="hand2"
        )
        self.btn_minimize.pack(side="left", padx=2)

        self.btn_close = tk.Label(
            btn_frame, text="✕", font=("Segoe UI", 12, "bold"),
            bg=c, fg="white", width=3, cursor="hand2"
        )
        self.btn_close.pack(side="left", padx=2)

        # ====== 2. 品牌展示区（绿色大图区）=====
        self.brand_area = tk.Frame(self, bg=c)
        self.brand_area.pack(fill="x")

        # 品牌内容容器（居中）
        brand_inner = tk.Frame(self.brand_area, bg=c)
        brand_inner.place(relx=0.5, rely=0.5, anchor="center")

        # 大 logo 区域（用文字模拟图标）
        self.lbl_logo = tk.Label(
            brand_inner, text="🧩",
            font=("Segoe UI Emoji", 64), bg=c, fg="white"
        )
        self.lbl_logo.pack(pady=(20, 4))

        # 软件名（大字）
        self.lbl_brand_name = tk.Label(
            brand_inner, text=cfg["APP_NAME"],
            font=("Microsoft YaHei UI", 28, "bold"), bg=c, fg="white"
        )
        self.lbl_brand_name.pack()

        # 副标题
        self.lbl_subtitle = tk.Label(
            brand_inner, text=cfg["SUBTITLE"],
            font=("Microsoft YaHei UI", 13), bg=c, fg=cl
        )
        self.lbl_subtitle.pack(pady=(0, 24))

        # ====== 3. 内容区（白色）=====
        self.content_area = tk.Frame(self, bg=cfg["COLOR_BG"])
        self.content_area.pack(fill="both", expand=True, padx=1)

        # --- 折叠箭头 ---
        arrow_frame = tk.Frame(self.content_area, bg=cfg["COLOR_BG"], height=28)
        arrow_frame.pack()
        arrow_btn = tk.Label(
            arrow_frame, text="▼", font=("Segoe UI", 10),
            bg=cfg["COLOR_BG"], fg=cfg["COLOR_TEXT_LIGHT"], cursor="hand2"
        )
        arrow_btn.pack(pady=4)

        # --- 选项区 ---
        options_frame = tk.Frame(self.content_area, bg=cfg["COLOR_BG"])
        options_frame.pack(padx=36, pady=(0, 16), anchor="w")

        # 协议勾选
        self.var_agree = tk.BooleanVar(value=False)
        cb_agree_frame = tk.Frame(options_frame, bg=cfg["COLOR_BG"])
        cb_agree_frame.pack(anchor="w", pady=4)

        self.cb_agree = tk.Checkbutton(
            cb_agree_frame, variable=self.var_agree,
            font=("Microsoft YaHei UI", 10),
            bg=cfg["COLOR_BG"], fg=cfg["COLOR_TEXT"],
            activebackground=cfg["COLOR_BG"], activeforeground=cfg["COLOR_TEXT"],
            selectcolor=cfg["COLOR_BG"],
            highlightthickness=0,
        )
        self.cb_agree.pack(side="left")

        agree_text = tk.Label(
            cb_agree_frame,
            text=" 我已经阅读并认可《",
            font=("Microsoft YaHei UI", 10),
            bg=cfg["COLOR_BG"], fg=cfg["COLOR_TEXT"]
        )
        agree_text.pack(side="left")

        self.lbl_license_link = tk.Label(
            cb_agree_frame, text="软件许可及服务协议",
            font=("Microsoft YaHei UI", 10, "underline"),
            bg=cfg["COLOR_BG"], fg=cfg["COLOR_LINK"], cursor="hand2"
        )
        self.lbl_license_link.pack(side="left")
        self.lbl_license_link.bind("<Button-1>", self._show_license)

        agree_end = tk.Label(
            cb_agree_frame, text="》",
            font=("Microsoft YaHei UI", 10),
            bg=cfg["COLOR_BG"], fg=cfg["COLOR_TEXT"]
        )
        agree_end.pack(side="left")

        # 桌面图标勾选
        self.var_desktop = tk.BooleanVar(value=True)
        cb_desktop = tk.Checkbutton(
            options_frame, variable=self.var_desktop,
            text="创建桌面图标",
            font=("Microsoft YaHei UI", 10),
            bg=cfg["COLOR_BG"], fg=cfg["COLOR_TEXT"],
            activebackground=cfg["COLOR_BG"], activeforeground=cfg["COLOR_TEXT"],
            selectcolor=cfg["COLOR_BG"],
            highlightthickness=0,
        )
        cb_desktop.pack(anchor="w", pady=4)

        # --- 一键安装按钮 ---
        btn_frame = tk.Frame(self.content_area, bg=cfg["COLOR_BG"])
        btn_frame.pack(pady=(8, 20))

        self.btn_install = tk.Button(
            btn_frame, text="一键安装",
            font=("Microsoft YaHei UI", 13, "bold"),
            bg=c, fg="white", activebackground=cd, activeforeground="white",
            relief="flat", cursor="hand2",
            width=22, height=1,
            command=self._on_install,
        )
        self.btn_install.pack()

        # 按钮悬停效果
        self.btn_install.bind("<Enter>", lambda e: self.btn_install.configure(bg=cd))
        self.btn_install.bind("<Leave>", lambda e: self.btn_install.configure(bg=c))

        # --- 底部标签 ---
        footer = tk.Frame(self.content_area, bg=cfg["COLOR_BG"])
        footer.pack(side="bottom", pady=(0, 12))

        footer_lbl = tk.Label(
            footer, text=f"⚙ {cfg['APP_NAME']} v{cfg['VERSION']}  ·  Python 安装程序",
            font=("Microsoft YaHei UI", 9), bg=cfg["COLOR_BG"],
            fg=cfg["COLOR_TEXT_LIGHT"]
        )
        footer_lbl.pack()

        # ====== 4. 进度条（初始隐藏）=====
        self.progress_frame = tk.Frame(self.content_area, bg=cfg["COLOR_BG"])
        self.progress_label = tk.Label(
            self.progress_frame, text="正在准备...",
            font=("Microsoft YaHei UI", 10),
            bg=cfg["COLOR_BG"], fg=cfg["COLOR_TEXT"]
        )
        self.progress_label.pack(pady=(8, 4))
        style = ttk.Style()
        style.theme_use("default")
        style.configure(
            "green.Horizontal.TProgressbar",
            troughcolor="#E8F5E9", background=c, thickness=8
        )
        self.progress_bar = ttk.Progressbar(
            self.progress_frame, mode="determinate",
            length=380, style="green.Horizontal.TProgressbar",
            maximum=100
        )
        self.progress_bar.pack(pady=(0, 4))
        self.progress_pct = tk.Label(
            self.progress_frame, text="0%",
            font=("Microsoft YaHei UI", 10),
            bg=cfg["COLOR_BG"], fg=cfg["COLOR_TEXT_LIGHT"]
        )
        self.progress_pct.pack(pady=(0, 12))

        # ====== 5. 完成页（初始隐藏）=====
        self.done_frame = tk.Frame(self.content_area, bg=cfg["COLOR_BG"])

        done_icon = tk.Label(
            self.done_frame, text="✅",
            font=("Segoe UI Emoji", 48), bg=cfg["COLOR_BG"]
        )
        done_icon.pack(pady=(20, 8))

        done_title = tk.Label(
            self.done_frame, text="安装完成！",
            font=("Microsoft YaHei UI", 18, "bold"),
            bg=cfg["COLOR_BG"], fg=cfg["COLOR_PRIMARY_DARK"]
        )
        done_title.pack()

        done_info = tk.Label(
            self.done_frame,
            text=f"{cfg['APP_NAME']} {cfg['VERSION']} 已成功安装到您的电脑。",
            font=("Microsoft YaHei UI", 10),
            bg=cfg["COLOR_BG"], fg=cfg["COLOR_TEXT_LIGHT"],
            wraplength=400, justify="center"
        )
        done_info.pack(pady=(4, 16))

        self.btn_finish = tk.Button(
            self.done_frame, text="完成",
            font=("Microsoft YaHei UI", 12, "bold"),
            bg=c, fg="white", activebackground=cd,
            relief="flat", cursor="hand2", width=14,
            command=self.destroy,
        )
        self.btn_finish.pack(pady=(0, 20))
        self.btn_finish.bind("<Enter>", lambda e: self.btn_finish.configure(bg=cd))
        self.btn_finish.bind("<Leave>", lambda e: self.btn_finish.configure(bg=c))

    # ---- 事件处理 ----
    def _show_license(self, event=None):
        """显示许可协议弹窗。"""
        license_text = f"""{self.cfg['APP_NAME']} 软件许可及服务协议
{'=' * 40}

版本：{self.cfg['VERSION']}
发布者：{self.cfg['PUBLISHER']}
网站：{self.cfg['WEBSITE']}

1. 本软件基于 GPL-3.0 开源协议发布。
2. 您可以自由使用、复制、修改和分发本软件。
3. 本软件按"原样"提供，不提供任何明示或暗示的担保。
4. 作者不对因使用本软件造成的任何损失承担责任。

完整开源代码请访问项目 GitHub 仓库。
"""
        # 创建协议窗口
        top = tk.Toplevel(self)
        top.title("软件许可及服务协议")
        top.geometry("520x420")
        top.resizable(False, False)
        try:
            icon_p = resolve(self.cfg.get("ICON_FILE", ""))
            if icon_p.exists():
                top.iconbitmap(str(icon_p))
        except Exception:
            pass

        txt = tk.Text(top, font=("Microsoft YaHei UI", 10), wrap="word",
                      bg="white", fg="#333", borderwidth=0, padx=16, pady=16)
        txt.insert("1.0", license_text)
        txt.config(state="disabled")
        txt.pack(fill="both", expand=True, padx=12, pady=12)

        btn = tk.Button(top, text="我已阅读并同意", font=("Microsoft YaHei UI", 10),
                       command=top.destroy, bg=self.cfg["COLOR_PRIMARY"],
                       fg="white", relief="flat", cursor="hand2", width=16)
        btn.pack(pady=(0, 12))

    def _on_install(self):
        """点击「一键安装」后的主流程。"""
        # 校验协议勾选
        if not self.var_agree.get():
            messagebox.showwarning("提示", "请先阅读并同意《软件许可及服务协议》")
            return

        # 切换到进度状态
        self.btn_install.pack_forget()
        self.progress_frame.pack(padx=36, fill="x")

        # 异步执行安装（避免 UI 卡死）
        self.after(100, self._do_install)

    def _do_install(self):
        """执行实际安装步骤，逐步更新进度条。"""
        cfg = self.cfg
        src = self.source_dir
        dst = self.install_dir
        icon_path = resolve(cfg.get("ICON_FILE", ""))

        steps = [
            ("检查源文件...", 5),
            ("创建安装目录...", 15),
            ("复制程序文件...", 25),
            ("复制运行时依赖...", 50),
            ("创建快捷方式...", 75),
            ("写入卸载信息...", 90),
            ("完成安装...", 100),
        ]

        for i, (msg, pct) in enumerate(steps):
            self.progress_label.config(text=msg)
            self.progress_bar["value"] = pct
            self.progress_pct.config(text=f"{pct}%")
            self.update()
            time.sleep(0.3)  # 让用户看到进度变化

            try:
                if i == 0:  # 检查源文件
                    if not src.is_dir():
                        raise FileNotFoundError(f"源目录不存在：{src}")
                    if not (src / cfg["MAIN_EXE"]).is_file():
                        raise FileNotFoundError(f"主程序不存在：{src / cfg['MAIN_EXE']}")

                elif i == 1:  # 创建安装目录
                    dst.mkdir(parents=True, exist_ok=True)

                elif i == 2:  # 复制程序文件（核心应用代码）
                    app_src = src / "resources" / "app"
                    if app_src.exists():
                        dst_app = dst / "resources" / "app"
                        shutil.copytree(app_src, dst_app, dirs_exist_ok=True)
                    else:
                        # 无 resources/app 结构，直接复制全部
                        pass

                elif i == 3:  # 复制运行时依赖（electron dll/pak 等）
                    for item in src.iterdir():
                        target = dst / item.name
                        if item.is_file():
                            shutil.copy2(item, target)
                        elif item.is_dir() and item.name != "node_modules":
                            if target.exists():
                                shutil.rmtree(target, ignore_errors=True)
                            shutil.copytree(item, target, dirs_exist_ok=True)

                elif i == 4:  # 快捷方式
                    exe_target = dst / cfg["MAIN_EXE"]
                    if self.var_desktop.get() and exe_target.exists():
                        desktop = Path.home() / "Desktop" / f"{cfg['APP_NAME_EN']}.lnk"
                        icon_str = str(icon_path) if icon_path.exists() else ""
                        create_shortcut(exe_target, desktop, icon_str)

                    # 开始菜单
                    sm_dir = Path(os.environ.get("APPDATA", "")) / \
                        "Microsoft/Windows/Start Menu/Programs" / cfg["APP_NAME_EN"]
                    sm_dir.mkdir(parents=True, exist_ok=True)
                    sm_lnk = sm_dir / f"{cfg['APP_NAME_EN']}.lnk"
                    create_shortcut(exe_target, sm_lnk, icon_str)
                    # 卸载快捷方式
                    unl_lnk = sm_dir / f"卸载 {cfg['APP_NAME_EN']}.lnk"
                    create_shortcut(dst / "uninstaller.pyw", unl_lnk, "")

                elif i == 5:  # 卸载信息
                    generate_uninstaller(dst, cfg)
                    write_uninstall_registry(dst, cfg)

                elif i == 6:  # 完成
                    pass

            except Exception as e:
                self.progress_label.config(text=f"错误：{e}")
                self.progress_label.configure(fg="red")
                messagebox.showerror("安装失败", f"安装过程中出错：\n{e}")
                # 恢复按钮
                self.progress_frame.pack_forget()
                self.btn_install.pack()
                return

        # 显示完成页
        self.progress_frame.pack_forget()
        self.done_frame.pack(fill="both", expand=True)


# ==================================================================
# 五、入口
# ==================================================================

def main():
    parser = argparse.ArgumentParser(description="鼠大侠风格 Python 安装程序")
    parser.add_argument("--version", help="覆盖版本号")
    parser.add_argument("--source", help="覆盖源程序目录")
    args = parser.parse_args()

    cfg = dict(CONFIG)
    if args.version:
        cfg["VERSION"] = args.version
    if args.source:
        cfg["SOURCE_DIR"] = args.source

    source_dir = resolve(cfg["SOURCE_DIR"])

    if not source_dir.is_dir():
        print(f"错误：源目录不存在：{source_dir}")
        sys.exit(1)

    # 统计
    fc, fb = count_files(source_dir)
    print(f"源目录：{source_dir} ({fc} 个文件, {fb / (1024*1024):.1f} MB)")

    root = InstallerWindow(cfg, source_dir)
    root.mainloop()


if __name__ == "__main__":
    main()
