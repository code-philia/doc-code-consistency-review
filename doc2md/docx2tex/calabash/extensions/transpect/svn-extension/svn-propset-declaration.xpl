<?xml version="1.0"?>
<p:declare-step xmlns:p="http://www.w3.org/ns/xproc" 
  xmlns:svn="http://transpect.io/svn" 
  version="1.0" 
  type="svn:propset">
  <p:input port="source" sequence="true">
    <p:documentation>Expects a list of svn:property elements, containing the properties to set.</p:documentation>
  </p:input>

  <p:output port="result" sequence="true">
    <p:documentation>Provides the result.</p:documentation>
  </p:output>

  <p:option name="path">
    <p:documentation>Path to a working copy,
    applicable values are:
    C:/home/Martin/transpect
    ../transpect
    </p:documentation>
  </p:option>
  <p:option name="username">
    <p:documentation>The username for authentification.</p:documentation>
  </p:option>
  <p:option name="password">
    <p:documentation>The password for authentification.</p:documentation>
  </p:option>
  

</p:declare-step>
