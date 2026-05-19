<?xml version="1.0"?>
<p:declare-step xmlns:p="http://www.w3.org/ns/xproc" 
  xmlns:svn="http://transpect.io/svn" 
  version="1.0" 
  type="svn:copy">

  <p:output port="result" sequence="true">
    <p:documentation>The output is the XML representation of the commit.</p:documentation>
  </p:output>

  <p:option name="repo">
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
  <p:option name="path">
    <p:documentation>Whitespace-separated list of paths to be copied or moved.</p:documentation>
  </p:option>
  <p:option name="target">
    <p:documentation>Target path</p:documentation>
  </p:option>
  <p:option name="move" select="'no'">
    <p:documentation>Whether the file should be copied or moved (e.g. original path is deleted).</p:documentation>
  </p:option>
  <p:option name="message" select="'svn:delete removed path'">
    <p:documentation>Provide a message for your commit.</p:documentation>
  </p:option>
  
</p:declare-step>
