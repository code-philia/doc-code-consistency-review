<?xml version="1.0"?>
<p:declare-step xmlns:p="http://www.w3.org/ns/xproc" 
  xmlns:svn="http://transpect.io/svn" 
  version="1.0" 
  type="svn:lock">

  <p:output port="result" sequence="true">
    <p:documentation>Locks files in a repository.</p:documentation>
  </p:output>

  <p:option name="repo">
    <p:documentation>Url of the repository.</p:documentation>
  </p:option>
  <p:option name="username">
    <p:documentation>The username for authentification.</p:documentation>
  </p:option>
  <p:option name="password">
    <p:documentation>The password for authentification.</p:documentation>
  </p:option>
  <p:option name="path">
    <p:documentation>Whitespace-separated list of
    paths to be locked.</p:documentation>
  </p:option>
  <p:option name="unlock" select="'no'">
    <p:documentation>If set to yes, a file is unlocked. Any other value means locking.</p:documentation>
  </p:option>
  <p:option name="break-lock" select="'no'">
    <p:documentation>Whether existing locks should be removed.</p:documentation>
  </p:option>
  <p:option name="message" select="''">
    <p:documentation>Lock message.</p:documentation>
  </p:option>
  
</p:declare-step>
