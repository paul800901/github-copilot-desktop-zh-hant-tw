using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class TrayMenuLocalizer
{
    private const uint MN_GETHMENU = 0x01E1;
    private const uint MF_BYPOSITION = 0x00000400;
    private const uint MF_STRING = 0x00000000;
    private const uint MIIM_STRING = 0x00000040;
    private const uint RDW_INVALIDATE = 0x0001;
    private const uint RDW_ALLCHILDREN = 0x0080;
    private const uint RDW_UPDATENOW = 0x0100;

    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct MenuItemInfo
    {
        public uint cbSize;
        public uint fMask;
        public uint fType;
        public uint fState;
        public uint wID;
        public IntPtr hSubMenu;
        public IntPtr hbmpChecked;
        public IntPtr hbmpUnchecked;
        public IntPtr dwItemData;
        public IntPtr dwTypeData;
        public uint cch;
        public IntPtr hbmpItem;
    }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr window, StringBuilder className, int maximumCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern int GetMenuItemCount(IntPtr menu);

    [DllImport("user32.dll")]
    private static extern IntPtr CreatePopupMenu();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool AppendMenu(IntPtr menu, uint flags, UIntPtr itemId, string text);

    [DllImport("user32.dll")]
    private static extern bool DestroyMenu(IntPtr menu);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetMenuString(IntPtr menu, uint item, StringBuilder text, int maximumCount, uint flags);

    [DllImport("user32.dll")]
    private static extern IntPtr GetSubMenu(IntPtr menu, int position);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool SetMenuItemInfo(IntPtr menu, uint item, bool byPosition, ref MenuItemInfo information);

    [DllImport("user32.dll")]
    private static extern bool InvalidateRect(IntPtr window, IntPtr rectangle, bool erase);

    [DllImport("user32.dll")]
    private static extern bool RedrawWindow(IntPtr window, IntPtr updateRectangle, IntPtr updateRegion, uint flags);

    private static string targetExecutable;
    private static int ownerProcessId;
    private static string logPath;
    private static readonly HashSet<string> LoggedMenus = new HashSet<string>();

    private static readonly Dictionary<string, string> ExactTranslations = new Dictionary<string, string>
    {
        { "No active sessions", "目前沒有工作階段" },
        { "Create Session…", "建立工作階段…" },
        { "New Chat", "新增聊天" },
        { "Open GitHub Copilot", "開啟 GitHub Copilot" },
        { "Settings…", "設定…" },
        { "Quit", "結束" },
        { "Pinned", "已釘選" }
    };

    private static int Main(string[] args)
    {
        bool selfTest = false;
        for (int index = 0; index < args.Length; index++)
        {
            if (args[index] == "--exe" && index + 1 < args.Length) targetExecutable = Path.GetFullPath(args[++index]);
            else if (args[index] == "--owner-pid" && index + 1 < args.Length) int.TryParse(args[++index], out ownerProcessId);
            else if (args[index] == "--log" && index + 1 < args.Length) logPath = args[++index];
            else if (args[index] == "--self-test") selfTest = true;
        }

        if (selfTest) return RunSelfTest() ? 0 : 3;
        if (String.IsNullOrWhiteSpace(targetExecutable) || ownerProcessId <= 0) return 2;

        while (IsProcessRunning(ownerProcessId))
        {
            EnumWindows(LocalizeMenuWindow, IntPtr.Zero);
            Thread.Sleep(40);
        }
        return 0;
    }

    private static bool IsProcessRunning(int processId)
    {
        try
        {
            Process process = Process.GetProcessById(processId);
            return !process.HasExited;
        }
        catch
        {
            return false;
        }
    }

    private static bool LocalizeMenuWindow(IntPtr window, IntPtr parameter)
    {
        StringBuilder className = new StringBuilder(64);
        if (GetClassName(window, className, className.Capacity) == 0 || className.ToString() != "#32768") return true;

        uint processId;
        GetWindowThreadProcessId(window, out processId);
        if (!IsTargetProcess(processId)) return true;

        IntPtr menu = SendMessage(window, MN_GETHMENU, IntPtr.Zero, IntPtr.Zero);
        if (menu == IntPtr.Zero) return true;

        int changed = LocalizeMenu(menu);
        if (changed > 0)
        {
            InvalidateRect(window, IntPtr.Zero, true);
            RedrawWindow(window, IntPtr.Zero, IntPtr.Zero, RDW_INVALIDATE | RDW_ALLCHILDREN | RDW_UPDATENOW);
            LogTranslation(menu, changed);
        }
        return true;
    }

    private static bool IsTargetProcess(uint processId)
    {
        try
        {
            using (Process process = Process.GetProcessById((int)processId))
            {
                return String.Equals(Path.GetFullPath(process.MainModule.FileName), targetExecutable, StringComparison.OrdinalIgnoreCase);
            }
        }
        catch
        {
            return false;
        }
    }

    private static int LocalizeMenu(IntPtr menu)
    {
        int changed = 0;
        int count = GetMenuItemCount(menu);
        for (int position = 0; position < count; position++)
        {
            StringBuilder text = new StringBuilder(1024);
            GetMenuString(menu, (uint)position, text, text.Capacity, MF_BYPOSITION);
            string source = text.ToString();
            string translation = Translate(source);
            if (!String.Equals(source, translation, StringComparison.Ordinal) && SetMenuText(menu, position, translation)) changed++;

            IntPtr submenu = GetSubMenu(menu, position);
            if (submenu != IntPtr.Zero) changed += LocalizeMenu(submenu);
        }
        return changed;
    }

    private static string Translate(string source)
    {
        int acceleratorIndex = source.IndexOf('\t');
        string accelerator = acceleratorIndex >= 0 ? source.Substring(acceleratorIndex) : String.Empty;
        string label = acceleratorIndex >= 0 ? source.Substring(0, acceleratorIndex) : source;
        string exact;
        if (ExactTranslations.TryGetValue(label, out exact)) return exact + accelerator;
        if (label.EndsWith(" (Setting up…)", StringComparison.Ordinal)) return label.Substring(0, label.Length - 14) + "（正在設定…）" + accelerator;
        if (label.EndsWith(" · Needs input", StringComparison.Ordinal)) return label.Substring(0, label.Length - 14) + " · 需要輸入" + accelerator;
        if (label.EndsWith(" · Merge conflicts", StringComparison.Ordinal)) return label.Substring(0, label.Length - 18) + " · 有合併衝突" + accelerator;
        if (label.EndsWith(" · Merge ready", StringComparison.Ordinal)) return label.Substring(0, label.Length - 14) + " · 可合併" + accelerator;
        if (label.EndsWith(" · Working", StringComparison.Ordinal)) return label.Substring(0, label.Length - 10) + " · 執行中" + accelerator;
        if (label.StartsWith("View Release ", StringComparison.Ordinal)) return "檢視 " + label.Substring(13) + " 版本" + accelerator;
        if (label.StartsWith("Restart to Update to ", StringComparison.Ordinal)) return "重新啟動並更新至 " + label.Substring(21) + accelerator;
        return source;
    }

    private static bool RunSelfTest()
    {
        IntPtr menu = CreatePopupMenu();
        if (menu == IntPtr.Zero) return false;
        try
        {
            if (!AppendMenu(menu, MF_STRING, new UIntPtr(1), "New Chat")) return false;
            if (!AppendMenu(menu, MF_STRING, new UIntPtr(2), "Open GitHub Copilot\tCtrl+Shift+O")) return false;
            if (LocalizeMenu(menu) != 2) return false;

            StringBuilder first = new StringBuilder(128);
            StringBuilder second = new StringBuilder(128);
            GetMenuString(menu, 0, first, first.Capacity, MF_BYPOSITION);
            GetMenuString(menu, 1, second, second.Capacity, MF_BYPOSITION);
            return first.ToString() == "新增聊天" && second.ToString() == "開啟 GitHub Copilot\tCtrl+Shift+O";
        }
        finally
        {
            DestroyMenu(menu);
        }
    }

    private static bool SetMenuText(IntPtr menu, int position, string text)
    {
        IntPtr textPointer = Marshal.StringToHGlobalUni(text);
        try
        {
            MenuItemInfo information = new MenuItemInfo();
            information.cbSize = (uint)Marshal.SizeOf(typeof(MenuItemInfo));
            information.fMask = MIIM_STRING;
            information.dwTypeData = textPointer;
            information.cch = (uint)text.Length;
            return SetMenuItemInfo(menu, (uint)position, true, ref information);
        }
        finally
        {
            Marshal.FreeHGlobal(textPointer);
        }
    }

    private static void LogTranslation(IntPtr menu, int changed)
    {
        if (String.IsNullOrWhiteSpace(logPath)) return;
        string key = menu.ToInt64().ToString("X");
        if (!LoggedMenus.Add(key)) return;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(logPath));
            File.AppendAllText(logPath, DateTime.Now.ToString("O") + " translated=" + changed + Environment.NewLine, Encoding.UTF8);
        }
        catch { }
    }
}
