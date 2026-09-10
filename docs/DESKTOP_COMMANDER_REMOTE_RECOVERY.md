# Desktop Commander Remote Recovery

Status: candidate operational hardening for Windows. This does not claim to fix upstream `broadcast_v1` request loss.

## Problem class

Observed failure mode: the device can remain registered/online while remote tool delivery times out. Public Desktop Commander reports show that individual `broadcast_v1` calls can be lost upstream of local shell execution, and that restarts do not guarantee elimination of the transport bug.

## Goals

- Spend no money.
- Keep exactly one intended Desktop Commander remote agent process tree.
- Pin the currently validated package version instead of following `@latest` unexpectedly.
- Persist local state and logs under `%LOCALAPPDATA%\RUMBO\DesktopCommander`.
- Recover automatically after Windows logon and process failure.
- Provide an explicit manual recovery path for false-healthy remote states.
- Never touch RUMBO project data, browser-history evidence, or unrelated processes.

## Manual recovery

From the repository root, run:

```cmd
START_DESKTOP_COMMANDER_REMOTE.cmd
```

The launcher invokes the supervisor with `-RecoverExisting`. The supervisor only targets `node.exe`/`cmd.exe` process trees whose command line contains both `desktop-commander` and the `remote` argument. It then starts:

```text
npx --yes @wonderwhy-er/desktop-commander@0.2.48 remote
```

If authorization is required, complete the normal browser device flow and keep the process running until it reports `Device ready`.

## Install current-user autostart

Run from PowerShell in the repository:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\windows\install-desktop-commander-autostart.ps1
```

The installer copies the supervisor to `%LOCALAPPDATA%\RUMBO\DesktopCommander` and registers the current-user task `RUMBO Desktop Commander Remote`. The task runs at logon with limited privileges, ignores duplicate instances, starts when available, and retries after process failure.

## Evidence

The supervisor writes:

```text
%LOCALAPPDATA%\RUMBO\DesktopCommander\state.json
%LOCALAPPDATA%\RUMBO\DesktopCommander\logs\remote-YYYYMMDD-HHMMSS.log
```

`state.json` records UTC observation time, package version, host, log path, and lifecycle status. It contains no auth tokens by design.

## Operational gate

Remote mutations remain forbidden until all of the following pass consecutively:

```text
REGISTERED
AND PING
AND EXECUTION
AND FILESYSTEM
=> REMOTE_READY
```

For disk cleanup, require a precheck and an available postcheck before deletion. Do not blanket-delete `%TEMP%`; preserve RUMBO/Brave/Statekeep/history artifacts.

## Limitation

The local supervisor can recover process exits and provide deterministic manual restart. It cannot prove delivery of every hosted `broadcast_v1` request because the documented failure can occur upstream without a local channel-error event. Therefore an `online` device remains insufficient evidence for `REMOTE_READY`.
