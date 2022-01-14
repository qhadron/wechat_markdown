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
- [x] import/export of markdown/CSS/HTML files
  - [x] import is implemented with a load picker
  - [x] export is implemented with a file saver
- [ ] offline usage, similar to [this](https://youtu.be/sOq92prx00w)
- [ ] code formatting

# Other

- [x] add `eslint` and `prettier` to build/commit process
- [x] ~~fix `monaco` builds (font not resolved correctly, missing some component..., check docs again?)~~
  - this is probably caused by `esbuild-html` not resolving assets in `css` included from `js` files correctly.
    See https://github.com/chialab/rna/issues/38
  - [x] added a custom build step that resolves and copies assets properly
  - [x] add a custom build step based on [monaco-editor-webpack-plugin](https://github.com/microsoft/monaco-editor/tree/fc603de98e7dcd1ad6587ce3ad80431c567f9275/webpack-plugin) to reduce `monaco` code size
