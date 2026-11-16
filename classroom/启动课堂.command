#!/bin/zsh
# Keep the server in this Terminal window; do not choose a browser for the user.
set -u
classroom_dir="${0:A:h}"
if ! command -v python3 >/dev/null 2>&1; then
  print -u2 "没有找到 Python 3。此启动器不会自动安装软件。"
  print -u2 "请先准备 Python 3，再双击本文件。"
  read -r "?按回车关闭窗口。"
  exit 1
fi
python3 -u "${classroom_dir}/serve.py" "$@"
classroom_status=$?
if (( classroom_status != 0 )); then
  read -r "?请查看上面的提示。按回车关闭窗口。"
fi
exit "$classroom_status"
