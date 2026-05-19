# svn-extension
XML Calabash extensions to implement Subversion with [SVNKit](https://svnkit.com) as XProc steps.

## svn:info

Provides general information about a repository as `c:param-set`.

```xml
<svn:info xmlns:svn="http://transpect.io/svn">
  <p:with-option name="username" select="'user'"/>
  <p:with-option name="password" select="'pass'"/>
  <p:with-option name="repo"     select="'https://subversion.le-tex.de/common/'"/>
</svn:info>
```

This is the expected output:

```xml
<c:param-set xmlns:c="http://www.w3.org/ns/xproc-step">
  <c:param name="date" value="Thu Mar 08 21:14:24 CET 2018"/>
  <c:param name="path" value=""/>
  <c:param name="rev" value="6610"/>
  <c:param name="author" value="mkraetke"/>
  <c:param name="root-url" value="https://subversion.le-tex.de/common"/>
  <c:param name="uuid" value="d851d441-0421-4803-b127-45cb279a3ef2"/>
  <c:param name="nodekind" value="dir"/>
  <c:param name="url" value="https://subversion.le-tex.de/common"/>
</c:param-set>
```

## svn:mkdir

Creates a directory in a remote repository or working copy like `svn mkdir`.
The `dir` option expects a single path or a whitespace-separated list of paths.

```xml
<svn:mkdir xmlns:svn="http://transpect.io/svn">
  <p:with-option name="username" select="'user'"/>
  <p:with-option name="password" select="'pass'"/>
  <p:with-option name="repo"     select="'https://subversion.le-tex.de/common'"/>
  <p:with-option name="dir"      select="'my-new-dir'"/>
  <p:with-option name="parents"  select="'yes'"/>
  <p:with-option name="message"  select="'my commit message'"/>
</svn:mkdir>
```
This results in this output:

```xml
<c:param-set xmlns:c="http://www.w3.org/ns/xproc-step"
             xml:base="https://subversion.le-tex.de/common">
  <c:param name="mkdir" value="my-new-dir"/>
</c:param-set>
```

## svn:copy

Copies a whitespace-separated list of files
to another location in a working copy or a remote repository.

```xml
<svn:copy xmlns:svn="http://transpect.io/svn">
  <p:with-option name="username" select="'user'"/>
  <p:with-option name="password" select="'pass'"/>
  <p:with-option name="repo"     select="'https://subversion.le-tex.de/common'"/>
  <p:with-option name="path"     select="'path-to/source.xml'"/>
  <p:with-option name="target"   select="'path-to/target.xml'"/>
  <p:with-option name="message"  select="'my commit message'"/>
</svn:copy>
```

Output:

```xml
<c:param-set xmlns:c="http://www.w3.org/ns/xproc-step">
  <c:param name="date" value="Mon Mar 16 21:39:26 CET 2020"/>
  <c:param name="all" value="r2353 by 'mkraetke' at Mon Mar 16 21:39:26 CET 2020"/>
  <c:param name="author" value="mkraetke"/>
  <c:param name="revision" value="2353"/>
</c:param-set>
```

## svn:move

Moves a whitespace-separatedlist of filesv to another
location in a working copy or a remote repository.

```xml
<svn:move xmlns:svn="http://transpect.io/svn">
  <p:with-option name="username" select="'user'"/>
  <p:with-option name="password" select="'pass'"/>
  <p:with-option name="repo"     select="'https://subversion.le-tex.de/common'"/>
  <p:with-option name="path"     select="'path-to/source.xml'"/>
  <p:with-option name="target"   select="'path-to/target.xml'"/>
  <p:with-option name="message"  select="'my commit message'"/>
</svn:move>
```

Output:

```xml
<c:param-set xmlns:c="http://www.w3.org/ns/xproc-step">
  <c:param name="date" value="Mon Mar 16 21:39:26 CET 2020"/>
  <c:param name="all" value="r2353 by 'mkraetke' at Mon Mar 16 21:39:26 CET 2020"/>
  <c:param name="author" value="mkraetke"/>
  <c:param name="revision" value="2353"/>
</c:param-set>
```

## svn:delete

Deletes one or multiple paths in a working directory or remote repository. The `path`
option expects a whitespace-separated list of arguments.

```xml
<svn:delete xmlns:svn="http://transpect.io/svn">
  <p:with-option name="username" select="'user'"/>
  <p:with-option name="password" select="'pass'"/>
  <p:with-option name="repo"     select="'https://subversion.le-tex.de/common'"/>
  <p:with-option name="path"     select="'path-to/file-to-be-deleted.xml'"/>
  <p:with-option name="force"    select="'no'"/>
  <p:with-option name="message"  select="'my commit message'"/>
</svn:delete>
```

This report is generated on success:

```xml
<c:param-set xmlns:c="http://www.w3.org/ns/xproc-step"
             xml:base="https://subversion.le-tex.de/common">
  <c:param name="delete" value="path-to/file-to-be-deleted.xml"/>
</c:param-set>
```

## svn:add

Add files to a working copy just like `svn add`.

```xml
<svn:add xmlns:svn="http://transpect.io/svn">
  <p:with-option name="username" select="'user'"/>
  <p:with-option name="password" select="'pass'"/>
  <p:with-option name="repo"     select="'path-to-local-working-copy'"/>
  <p:with-option name="path"     select="'MyFile.xml'"/>
  <p:with-option name="parents"  select="'no'"/>
</svn:add>
```

A sample output of `svn:add` is shown below:

```xml
<c:param-set xmlns:c="http://www.w3.org/ns/xproc-step"
             xml:base="file:/home/Martin/path-to-local-working-copy">
  <c:param name="add" value="MyFile.txt"/>
</c:param-set>
```

## svn:commit

Commits one or more (whitespace-separated) paths and their children
in a SVN working copy. Please note that modified SVN properties are
not committed (I'm currently not sure if it would be needed to expose
the SVN depth as option).

```xml
<svn:commit xmlns:svn="http://transpect.io/svn">
  <p:with-option name="username" select="'user'"/>
  <p:with-option name="password" select="'pass'"/>
  <p:with-option name="path"     select="'path-to-be-commited'"/>
  <p:with-option name="message"  select="'my commit message'"/>
</svn:commit>
```

This is the expected output.

```xml
<c:param-set xmlns:c="http://www.w3.org/ns/xproc-step"
             xml:base="file:/home/path-to-be-commited">
   <c:param name="commit" value="path-to-be-commited"/>
</c:param-set>
```

## svn:list

List contents of a remote SVN repository or local working copy.
When the `recursive` option is set to yes, subdirectories are recursively listed.

```xml
<svn:list xmlns:svn="http://transpect.io/svn">
  <p:with-option name="username"  select="'user'"/>
  <p:with-option name="password"  select="'pass'"/>
  <p:with-option name="repo"      select="'https://subversion.le-tex.de/repo'"/>
  <p:with-option name="recursive" select="'yes'"/>
</svn:list>
```

Output:
```xml
<c:files xmlns:c="http://www.w3.org/ns/xproc-step"
         xml:base="https://subversion.le-tex.de/repo">
  <c:file name="myfile.xml" author="mkraetke" date="Sat Feb 14 12:11:22 CET 2015"
          revision="3181" size="846"/>
  <c:directory name="mydir" author="mkraetke" date="Wed Feb 25 18:58:31 CET 2015" 
               revision="3219" size="0"/>
</c:files>
```

## svn:update

Performs a `svn update` on a whitespace-separated list of paths.

```xml
<svn:update xmlns:svn="http://transpect.io/svn">
  <p:with-option name="username" select="'user'"/>
  <p:with-option name="password" select="'pass'"/>
  <p:with-option name="path"     select="'path1 path2'"/>
  <p:with-option name="revision" select="'HEAD'"/>
</svn:update>
```

Information about the updated revisions are exposed as `c:param-set`.

```xml
<c:param-set xmlns:c="http://www.w3.org/ns/xproc-step">
  <c:param name="path1" value="27"/>
  <c:param name="path2" value="152"/>
</c:param-set>
```

## svn:checkout

Checkout a working copy of a SVN repository.

```xml
<svn:checkout xmlns:svn="http://transpect.io/svn">
  <p:with-option name="username" select="'user'"/>
  <p:with-option name="password" select="'pass'"/>
  <p:with-option name="path"     select="'checkout-path'"/>
  <p:with-option name="repo"     select="'https://subversion.le-tex.de/myrepo'"/>
  <p:with-option name="revision" select="'HEAD'"/>
</svn:checkout>
```

Output

```xml
<c:param-set xmlns:c="http://www.w3.org/ns/xproc-step">
  <c:param name="path" value="checkout-path"/>
  <c:param name="repo"
           value="https://subversion.le-tex.de/myrepo"/>
  <c:param name="revision" value="6634"/>
</c:param-set>
```

## svn:propset

Set a property in the current working copy.
```xml
<svn:propset xmlns:svn="http://transpect.io/svn">
  <p:input port="source">
    <p:inline>
      <svn:property name="letex:test">
        addedViaSvnKit
      </svn:property>
    </p:inline>
  </p:input>
  <p:with-option name="username" select="'user'"/>
  <p:with-option name="password" select="'pass'"/>
  <p:with-option name="path"     select="'../transpect'"/>
</svn:checkout>
```

Output

```xml
<c:param-set xmlns:c="http://www.w3.org/ns/xproc-step">
  <c:param name="letex:test" value="addedViaSvnKit"/>
</c:param-set>

```

## svn:propget

Get the value of a property in the working copy or the remote repository
```xml
<svn:propget xmlns:svn="http://transpect.io/svn">
  <p:with-option name="username" select="'user'"/>
  <p:with-option name="password" select="'pass'"/>
  <p:with-option name="repo"     select="'../transpect'"/>
  <p:with-option name="property" select="'svn:externals'"/>
  <p:with-option name="revision" select="'HEAD'"/>
</svn:propget>
```

Output

```xml
<c:param-set xmlns:c="http://www.w3.org/ns/xproc-step">
  <c:param name="repo" value="C:/cygwin64/home/Martin/transpect/trunk"/>
  <c:param name="property" value="svn:externals"/>
  <c:param name="value"    value="cascade -r 82 https://github.com/transpect/cascade/trunk&#xD;&#xA;fontmaps -r 21 https://github.com/transpect/fontmaps/trunk&#xD;&#xA;cascade"/>
  <c:param name="revision" value="HEAD"/>
</c:param-set>
```
