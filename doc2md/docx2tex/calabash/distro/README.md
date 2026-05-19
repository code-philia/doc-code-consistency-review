# calabash-distro

This repo contains the default XML Calabash distribution as downloadable from https://github.com/ndw/xmlcalabash1/releases. Don’t wonder why there’s a README in addition to this README.md. The README.md is the only file that does not originate from the distro. README is XML Calabash’s original README.

Its purpose is to provide a place for svn or git based projects to attach their XPRoc runtime via external or submodule.

It contains the modularized version of Calabash, currently 1.1.21 for Saxon 9.8 (with xmlresolver v0.13.1 replaced with v0.14.0
and with Saxon and jing removed in order to save space – Saxon and jing will be supplied with calabash-frontend).
In order to obtain a version for Saxon 9.6, go to the master branch. 

This Calabash distro, together with a few other modules that almost every transpect projects needs, will be pulled as a submodule of [calabash-frontend](https://github.com/transpect/calabash-frontend) or as an external. Please see calabash-frontend’s README for instructions on how to include the Calabash externals/submodule into your project.

Git submodules is still quite arcane a topic to me. What I had to do here after cloning calabash-frontend recursively and after discovering that this distro submodule was still tracking the master branch (with detached head, alas):

```
git checkout -b saxon98 --track origin/saxon98
```
