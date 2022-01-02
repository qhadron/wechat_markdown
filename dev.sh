#!/usr/bin/env zsh
# vim: set ft=zsh :
set -euo pipefail

SCRIPT_DIR="${0:a:h}"
SCRIPT_NAME=$0

SESSION_NAME="wechat_markdown_dev"

TMUX_COMMANDS=(
	new-session -c "$SCRIPT_DIR" -s "$SESSION_NAME";
	set-option -w remain-on-exit on \;
	split-window -h -c "$SCRIPT_DIR" zsh -c 'source ~/.zshrc; yarn run start-dev' \;
	set-option -w remain-on-exit on \;
	select-layout even-horizontal \;
	kill-pane -t "{left}" \;	
	detach \;
)

function usage() {
	>&2 cat <<-EOF
	Usage: $SCRIPT_NAME [-s]

	Starts/stops a named tmux session running the 'dev' and 'build-watch' yarn 
	commands.  The session name is '$SESSION_NAME'.  If no arguments are 
	specified the session is restarted.

	Options:
		-s          Stop the session only.
		-h          Show help.
	EOF
}

action=start

while getopts ":s?h" c; do
	case $c in
		s)
			action=stop
			;;
		?|h)
			usage
			exit 2
			;;
		*)
			echo $c
			;;
	esac
done

if (tmux list-sessions -F '#S' | grep "$SESSION_NAME") &>/dev/null; then
	echo "Killing $SESSION_NAME"
	tmux kill-session -t "$SESSION_NAME"
fi

if [[ $action == "start" ]]; then
	echo "Starting $SESSION_NAME"
	exec tmux $TMUX_COMMANDS
fi
