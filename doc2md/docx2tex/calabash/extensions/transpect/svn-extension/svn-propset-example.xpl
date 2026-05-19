<p:declare-step 
  xmlns:p="http://www.w3.org/ns/xproc" 
  xmlns:c="http://www.w3.org/ns/xproc-step"
  xmlns:tr="http://transpect.io"
  xmlns:svn="http://transpect.io/svn" 
  name="pipeline" 
  version="1.0">

  <p:option name="username" select="'user'"/>
  <p:option name="password" select="'pass'"/>
  <p:option name="path" select="'local-path'"/>
    
  <p:output port="result" sequence="true"/>

  <p:import href="svn-propset-declaration.xpl"/>

  <svn:propset name="svn-propset">
    <p:input port="source"><!-- sequence of property documents -->
      <p:inline>
        <svn:property name="letex:test">
          addedViaSvnKit
        </svn:property>
      </p:inline>
    </p:input>
    <p:with-option name="username"   select="$username"/><!-- optional -->
    <p:with-option name="password"   select="$password"/><!-- optional -->
    <p:with-option name="path"       select="$path"/>    <!-- required -->
  </svn:propset>

</p:declare-step>