import os
import sys
import time
import json
import urllib.parse
import ctypes
from ctypes import wintypes
import subprocess

# Setup Win32 clipboard functions with 64-bit pointer safety
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

user32.OpenClipboard.argtypes = [wintypes.HWND]
user32.OpenClipboard.restype = wintypes.BOOL

user32.CloseClipboard.argtypes = []
user32.CloseClipboard.restype = wintypes.BOOL

user32.GetClipboardData.argtypes = [wintypes.UINT]
user32.GetClipboardData.restype = wintypes.HANDLE

kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalLock.restype = ctypes.c_void_p

kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalUnlock.restype = wintypes.BOOL

def read_clipboard_text():
    """Read text from Windows clipboard with 64-bit memory pointer safety"""
    CF_UNICODETEXT = 13
    
    # Try multiple times to give the OS and previous app time to process Ctrl+C
    for _ in range(8):
        if user32.OpenClipboard(None):
            try:
                handle = user32.GetClipboardData(CF_UNICODETEXT)
                if handle:
                    ptr = kernel32.GlobalLock(handle)
                    if ptr:
                        try:
                            val = ctypes.wstring_at(ptr)
                            if val:
                                return val
                        finally:
                            kernel32.GlobalUnlock(handle)
            finally:
                user32.CloseClipboard()
        time.sleep(0.04)
        
    return ""

def main():
    # Wait briefly for Kando's simulate-hotkey (ControlLeft+KeyC) to finish writing to clipboard
    time.sleep(0.12)
    
    selected_text = read_clipboard_text().strip()
    
    title = ""
    desc = ""
    
    if selected_text:
        lines = [line.strip() for line in selected_text.splitlines() if line.strip()]
        if len(lines) == 1:
            title = lines[0]
            desc = ""
        elif len(lines) > 1:
            title = lines[0]
            desc = "\n".join(lines[1:])
    
    payload = json.dumps({"title": title, "desc": desc})
    encoded = urllib.parse.quote(payload)
    
    # Resolve quick_task.html location
    candidates = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "quick_task.html"),
        r"C:\Users\Surface Laptop Go\AppData\Roaming\kando\scripts\quick_task.html",
        r"c:\Users\Surface Laptop Go\OneDrive - YCP Holdings\Documents\All Clients Websites\CMIC\trello-timeline\quick_task.html"
    ]
    
    html_path = candidates[0]
    for c in candidates:
        if os.path.exists(c):
            html_path = c
            break
            
    file_url = "file:///" + html_path.replace("\\", "/") + f"?data={encoded}"
    
    # Locate Microsoft Edge
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    ]
    
    edge_exe = "msedge"
    for p in edge_paths:
        if os.path.exists(p):
            edge_exe = p
            break
            
    user_data = os.path.join(os.environ.get("TEMP", r"C:\temp"), "trello_edge_app_profile")
    
    cmd = [
        edge_exe,
        f"--app={file_url}",
        f"--user-data-dir={user_data}",
        "--window-size=920,680",
        "--no-first-run",
        "--no-default-browser-check"
    ]
    
    DETACHED_PROCESS = 0x00000008
    CREATE_NEW_PROCESS_GROUP = 0x00000200
    
    subprocess.Popen(
        cmd,
        creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,
        close_fds=True
    )

if __name__ == "__main__":
    main()
