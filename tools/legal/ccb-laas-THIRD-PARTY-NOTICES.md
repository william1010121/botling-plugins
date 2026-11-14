# Third-party notices: ccb-laas

ccb-laas is Copyright (c) {{year}} {{holder}}, licensed under the GNU General Public License,
version 3 or (at your option) any later version. The full text is in `LICENSE`.

`dist/web.js` is a bundle (made with esbuild by the `build` script in `package.json`) that also
contains the third-party code below, unmodified apart from bundling (esbuild removes comments and
joins the modules into one file). Both are licensed under the Apache License, Version 2.0; its
full text is in `LICENSES/Apache-2.0.txt`. Neither package ships a NOTICE file.

## MathJax

- Package: `mathjax-full` 3.2.2 (as pinned in the `build` script)
- Copyright (c) 2009-2022 The MathJax Consortium
- License: Apache License, Version 2.0 (`LICENSES/Apache-2.0.txt`)
- Home: https://www.mathjax.org

## mhchemParser (bundled by MathJax for `\ce` and `\pu`)

- Package: `mhchemparser` 4.2.1 (a dependency of mathjax-full; the copyright header kept in the
  bundle matches this version)
- Copyright (c) 2015-2023 Martin Hensel
- License: Apache License, Version 2.0 (`LICENSES/Apache-2.0.txt`)
- Home: https://mhchem.github.io/MathJax-mhchem/

## Ported behaviour

The snippet engine in `src/engine/` is a port of the behaviour and snippet tables of web-laas
and of the Emacs packages laas (LaTeX Auto Activating Snippets) and cdlatex, which are
distributed under the GNU GPL; that is why ccb-laas is licensed under GPL-3.0-or-later.
