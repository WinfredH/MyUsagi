//! Windows: global cursor via Win32 API; dev-only native window outline.

#[cfg(windows)]
pub fn get_cursor_position() -> (i32, i32) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT { x: 0, y: 0 };
    unsafe {
        let _ = GetCursorPos(&mut p);
    }
    (p.x, p.y)
}

#[cfg(not(windows))]
pub fn get_cursor_position() -> (i32, i32) {
    (0, 0)
}

pub fn configure(_app: &tauri::AppHandle) {}

/// Visible native frame for debug (`cargo tauri dev` / debug profile).
/// Production keeps `set_shadow(false)` to avoid the 1px white artifact on Win10.
#[cfg(windows)]
pub fn apply_dev_window_outline(window: &tauri::WebviewWindow) {
    // Undecorated transparent windows: DWM shadow draws a native outline around the HWND.
    let _ = window.set_shadow(true);

    let Ok(tauri_hwnd) = window.hwnd() else {
        return;
    };

    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_NCRENDERING_ENABLED,
        DWMWA_NCRENDERING_POLICY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, GWL_STYLE,
        SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_BORDER, WS_EX_CLIENTEDGE,
    };

    // Tauri links a different `windows` crate; rebuild HWND from the raw handle value.
    let hwnd = HWND(tauri_hwnd.0);

    const DWMNCRP_ENABLED: u32 = 2;
    // #ff1493 in COLORREF (0x00BBGGRR)
    const DEV_BORDER_COLOR: u32 = 0x0093_14FF;

    unsafe {
        let enabled: u32 = 1;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_NCRENDERING_ENABLED,
            &enabled as *const _ as _,
            std::mem::size_of::<u32>() as u32,
        );
        let policy: u32 = DWMNCRP_ENABLED;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_NCRENDERING_POLICY,
            &policy as *const _ as _,
            std::mem::size_of::<u32>() as u32,
        );
        // Win11 22000+: colored NC border; silently ignored on Win10.
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &DEV_BORDER_COLOR as *const _ as _,
            std::mem::size_of::<u32>() as u32,
        );

        let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
        let _ = SetWindowLongPtrW(hwnd, GWL_STYLE, (style | WS_BORDER.0) as isize);

        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let _ = SetWindowLongPtrW(
            hwnd,
            GWL_EXSTYLE,
            (ex_style | WS_EX_CLIENTEDGE.0) as isize,
        );

        let _ = SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
        );
    }
}

#[cfg(not(windows))]
pub fn apply_dev_window_outline(_window: &tauri::WebviewWindow) {}
