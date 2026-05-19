<p:declare-step 
  xmlns:p="http://www.w3.org/ns/xproc" 
  xmlns:c="http://www.w3.org/ns/xproc-step"
  xmlns:tr="http://transpect.io" 
  xmlns:dbk="http://docbook.org/ns/docbook" 
  name="pipeline" 
  version="1.0">

  <p:option name="image-uri" required="false" select="'test/logo-letex.png'"/>

  <p:output port="result" primary="true" sequence="true">
    <p:pipe step="image-identify" port="report"/>
  </p:output>

  <p:import href="image-identify-declaration.xpl"/>

  <p:template name="template">
    <p:input port="source">
      <p:empty/>
    </p:input>
    <p:input port="template">
      <p:inline>
        <article xmlns="http://docbook.org/ns/docbook" xmlns:xlink="http://www.w3.org/1999/xlink" version="5.0">
          <title>Images</title>
          <sect1>
            <title>Section1 Title</title>
            <mediaobject>
              <imageobject>
                <imagedata fileref="{$image-uri}"/>
              </imageobject>
            </mediaobject>
            <para>Text</para>
          </sect1>
        </article>
      </p:inline>
    </p:input>
    <p:with-param name="image-uri" select="$image-uri"/>
  </p:template>

  <tr:image-identify name="image-identify" metadata="yes">
    <p:with-option name="href" select="(//dbk:imagedata)[1]/@fileref"/>
  </tr:image-identify>

  <p:sink/>

</p:declare-step>
