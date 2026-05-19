<p:declare-step 
  xmlns:p="http://www.w3.org/ns/xproc" 
  xmlns:c="http://www.w3.org/ns/xproc-step"
  xmlns:cx="http://xmlcalabash.com/ns/extensions"
  xmlns:letex="http://www.le-tex.de/namespace" 
  xmlns:tr="http://transpect.io" 
  xmlns:dbk="http://docbook.org/ns/docbook" 
  name="pipeline" 
  version="1.0">

  <p:option name="image-uri" required="false" select="'logo-letex.png'"/>

  <p:input port="source">
    <p:inline>
      <article xmlns="http://docbook.org/ns/docbook" xmlns:xlink="http://www.w3.org/1999/xlink" version="5.0">
        <title>Images</title>
        <sect1>
          <title>Section1 Title</title>
          <mediaobject>
            <imageobject>
              <imagedata fileref="non-existent.jpg"/>
            </imageobject>
          </mediaobject>
          <mediaobject>
            <imageobject>
              <imagedata fileref="test/CMYK.jpg"/>
            </imageobject>
          </mediaobject>
          <para>Text</para>
        </sect1>
      </article>
    </p:inline>
  </p:input>
  
  <p:import href="image-transform-declaration.xpl"/>

  <tr:image-transform name="image-transform">
    <p:with-option name="href" select="(//dbk:imagedata)[2]/@fileref">
      <p:pipe port="source" step="pipeline"/>
    </p:with-option>
    <p:with-option name="resize" select="'75%'"/>
  </tr:image-transform>
  
  <p:sink/>
  
  <p:store cx:decode="true" href="test/test.jpg">
  	<p:input port="source">
  		<p:pipe step="image-transform" port="result"/>
  	</p:input>
  </p:store>

</p:declare-step>