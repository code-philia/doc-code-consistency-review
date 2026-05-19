<p:declare-step 
  xmlns:p="http://www.w3.org/ns/xproc" 
  xmlns:c="http://www.w3.org/ns/xproc-step"
  xmlns:tr="http://transpect.io"
  xmlns:svn="http://transpect.io/svn" 
  name="pipeline" 
  version="1.0">

  <p:option name="username" select="'user or path'"/>
  <p:option name="password" select="'pass'"/>
  <p:option name="repo"     select="'repo-path'"/>
  <p:option name="property" select="'svn:externals'"/>
  <p:option name="revision" select="'HEAD'"/>
    
  <p:output port="result" sequence="true"/>

  <p:import href="svn-propget-declaration.xpl"/>

  <svn:propget name="svn-propget">
    <p:with-option name="username" select="$username"/><!-- optional -->
    <p:with-option name="password" select="$password"/><!-- optional -->
    <p:with-option name="repo"     select="$repo"/>    <!-- required -->
    <p:with-option name="property" select="$property"/><!-- whitespace-separated list -->
    <p:with-option name="revision" select="$revision"/><!-- revision -->
  </svn:propget>

</p:declare-step>
