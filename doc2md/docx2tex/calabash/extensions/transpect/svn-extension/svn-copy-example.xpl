<p:declare-step xmlns:p="http://www.w3.org/ns/xproc" 
  xmlns:svn="http://transpect.io/svn" 
  name="pipeline" 
  version="1.0">

  <p:option name="repo" select="'https://subversion.le-tex.de/common/'"/>
  <p:option name="username" select="'user'"/>
  <p:option name="password" select="'pass'"/>
  <p:option name="path"     select="'ToBeCopied'"/>
  <p:option name="target"     select="'Output'"/>
  <p:option name="move" select="'no'"/>  
  <p:option name="message" select="'my commit message'"/>

  <p:output port="result" sequence="true"/>

  <p:import href="svn-copy-declaration.xpl"/>

  <svn:copy name="svn-copy">
    <p:with-option name="repo"     select="$repo"/>
    <p:with-option name="username" select="$username"/>
    <p:with-option name="password" select="$password"/>
    <p:with-option name="path"     select="$path"/>
    <p:with-option name="target"   select="$target"/>
    <p:with-option name="move"     select="$move"/>
    <p:with-option name="message"  select="$message"/>
  </svn:copy>

</p:declare-step>
