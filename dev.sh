#!/usr/bin/env zsh
# vim: set ft=zsh :
set -euo pipefail

SCRIPT_DIR="${0:a:h}"

SESSION_NAME="wechat_markdown_dev"

TMUX_COMMANDS=(
	new-session -c "$SCRIPT_DIR" -s "$SESSION_NAME";
	set-option -w remain-on-exit on \;
	split-window -h -c "$SCRIPT_DIR" zsh -c 'source ~/.zshrc; yarn run build-watch' \;
	split-window -h -c "$SCRIPT_DIR" zsh -c 'source ~/.zshrc; yarn run dev' \;
	set-option -w remain-on-exit on \;
	select-layout even-horizontal \;
	kill-pane -t "{left}" \;	
	detach \;
)


if  (tmux list-sessions -F '#S' | grep "$SESSION_NAME") &>/dev/null; then
	echo "Killing $SESSION_NAME"
	tmux kill-session -t "$SESSION_NAME"
fi

exec tmux $TMUX_COMMANDS
