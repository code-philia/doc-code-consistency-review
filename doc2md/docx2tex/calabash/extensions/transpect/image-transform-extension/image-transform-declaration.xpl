<?xml version="1.0"?>
<p:declare-step  
  xmlns:p="http://www.w3.org/ns/xproc" 
  xmlns:c="http://www.w3.org/ns/xproc-step"
  xmlns:tr="http://transpect.io" 
  version="1.0"
  type="tr:image-transform">
  
  <p:documentation>Transform raster images.</p:documentation>

  <p:input port="source" primary="true" sequence="true">
    <p:documentation>Any XML document(s), or none.</p:documentation>
  </p:input>
  <p:output port="result" primary="true">
    <p:documentation>The input, passed thru.</p:documentation>
  </p:output>
  <p:option name="href" required="true">
    <p:documentation>The input image file's URI.</p:documentation>
  </p:option>
  <p:option name="resize">
    <p:documentation>A subset of ImageMagick’s resize option,
    Supported options: scale%, area@, widthxheight, widthxheight>.
    See http://www.imagemagick.org/script/command-line-processing.php#geometry
    </p:documentation>
  </p:option>
  <p:option name="media-type" select="'image/jpg'">
  	<p:documentation>The media type of the output image. "image/jpg" and "image/png" are supported.</p:documentation>
  </p:option>
  <p:option name="quality" select="'100%'">
  	<p:documentation>The compression of the ouput image. Only for "image/jpg".</p:documentation>
  </p:option>
  <p:option name="target-dpi">
    <p:documentation>For example, 72.</p:documentation>
  </p:option>
</p:declare-step>
