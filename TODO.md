# Looks
- [x] similar layout to ~~https://marked.js.org/demo/~~ https://markdown-it.github.io/
- [x] side-by-side live preview of rendered markdown content
- [x] synced scrolling (see [markdown-it's demo](https://markdown-it.github.io/) [[source](https://github.com/markdown-it/markdown-it/blob/df4607f1d4d4be7fdc32e71c04109aea8cc373fa/support/demo_template/index.js)] )
- [x] find a way to adjust size of editors ~~(use golden layout like compiler explorer?)~~ used [split.js](https://split.js.org/) instead.
- [x] add reversed synced scrolling?
- [ ] add default CSS for markdown document

# Functionality
- [x] support for HTML tags in markdown
	- provided by `marked`
- [x] allow custom CSS to be used for styling
	- styles are inlined using `juice`
- [ ] in-browser persistent storage
- [ ] import/export of markdown/CSS/HTML files

# Other
- [ ] add `eslint` and `prettier` to build/commit process
- [ ] fix `monaco` builds (font not resolved correctly, missing some component..., check docs again?)
