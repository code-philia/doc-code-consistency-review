<p:declare-step 
  xmlns:p="http://www.w3.org/ns/xproc" 
  xmlns:c="http://www.w3.org/ns/xproc-step"
  xmlns:tr="http://transpect.io"
  xmlns:svn="http://transpect.io/svn" 
  name="pipeline" 
  version="1.0">

  <p:option name="username" select="'user'"/>
  <p:option name="password" select="'pass'"/>
  <p:option name="url"     select="'https://subversion.le-tex.de/common/ToBeDeleted'"/>
  <p:option name="force" select="'no'"/>  
  <p:option name="message" select="'my commit message'"/>

  <p:output port="result" sequence="true"/>

  <p:import href="svn-delete-declaration.xpl"/>

  <svn:delete name="svn-delete">
    <p:with-option name="username" select="$username"/>
    <p:with-option name="password" select="$password"/>
    <p:with-option name="url"     select="$url"/>
    <p:with-option name="message"  select="$message"/>
  </svn:delete>

</p:declare-step>
