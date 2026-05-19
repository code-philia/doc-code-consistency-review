<?xml version="1.0"?>
<p:declare-step xmlns:p="http://www.w3.org/ns/xproc" 
  xmlns:svn="http://transpect.io/svn" 
  version="1.0" 
  type="svn:delete">

  <p:output port="result" sequence="true">
    <p:documentation>Select one or multiple paths
    in a SVN repository for deletion.</p:documentation>
  </p:output>

  <p:option name="url">
    <p:documentation>
      Whitespace-separated list of
      paths or URLs to be deleted.
    </p:documentation>
  </p:option>
  <p:option name="username">
    <p:documentation>The username for authentification.</p:documentation>
  </p:option>
  <p:option name="password">
    <p:documentation>The password for authentification.</p:documentation>
  </p:option>
  <p:option name="force" select="'no'">
    <p:documentation>Force deletion of selected paths.
    Possible values are 'yes' and 'no' (default).</p:documentation>
  </p:option>
  <p:option name="message" select="'svn:delete removed path'">
    <p:documentation>Provide a message for your commit.</p:documentation>
  </p:option>
  
</p:declare-step>
