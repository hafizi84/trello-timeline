import os
import sys
import time
import json
import urllib.parse
import ctypes
import tkinter as tk
import subprocess

def grab_highlighted_text():
    """Simulate Ctrl+C to copy highlighted text from the active foreground window"""
    user32 = ctypes.windll.user32
    
    # Pause to let Kando close and restore focus to the previous active window
    time.sleep(0.25)
    
    # Clear clipboard first so stale text is not grabbed if nothing was highlighted
    try:
        root = tk.Tk()
        root.withdraw()
        root.clipboard_clear()
        root.destroy()
    except Exception:
        pass
        
    time.sleep(0.05)
    
    # VK_CONTROL = 0x11, VK_C = 0x43, KEYEVENTF_KEYUP = 0x0002
    user32.keybd_event(0x11, 0, 0, 0)
    user32.keybd_event(0x43, 0, 0, 0)
    user32.keybd_event(0x43, 0, 2, 0)
    user32.keybd_event(0x11, 0, 2, 0)
    
    time.sleep(0.18)
    
    # Read clipboard using Tkinter
    root = tk.Tk()
    root.withdraw()
    text = ""
    try:
        text = root.clipboard_get()
    except Exception:
        pass
    finally:
        try:
            root.destroy()
        except Exception:
            pass
            
    return text.strip()

def main():
    selected_text = grab_highlighted_text()
    
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
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    html_path = os.path.join(script_dir, "quick_task.html")
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
            
    cmd = [
        edge_exe,
        f"--app={file_url}",
        "--window-size=920,680"
    ]
    
    subprocess.Popen(cmd)

if __name__ == "__main__":
    main()
