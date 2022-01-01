#!/usr/bin/env zsh
# vim: set ft=zsh :
set -euo pipefail

remote_host=${1:-jack@192.168.0.99}
remote_path=${2:-\~/www/wechat_markdown}
if [[ $# -gt 2 ]]; then
	shift 2
	remote_cmd=$@
else
	remote_cmd=(
		cd $remote_path \;
		set -e \;
		find . -not -name 'dist.tar.gz' -delete \;
		tar xzvf ./dist.tar.gz \;
		rm -rf ./dist.tar.gz \;
		\~/services/nginx/update_conf.sh \;
	)
fi

set -x

yarn run dist
rsync ./dist.tar.gz $remote_host:$remote_path
ssh -tt $remote_host -- $remote_cmd
