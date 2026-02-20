; AutoHotkey template for OMAX LAYOUT fallback conversion.
; Args:
;   1 = input path (.ord/.omx)
;   2 = output dxf path
;
; Implement with your installed UI labels/shortcuts:
; - Launch LAYOUT
; - File > Open
; - Set file-type filter to include ORD/OMX or All Files
; - Open input
; - Save As DXF to output
; - Exit
;
; Return non-zero exit code on failure.

inputPath := A_Args[1]
outputPath := A_Args[2]

MsgBox, 16, Not Implemented, omax_ui_automation.ahk is a template. Implement for your environment.`nInput: %inputPath%`nOutput: %outputPath%
ExitApp 2
