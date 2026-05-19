<?xml version="1.0"?>
<p:declare-step  
  xmlns:p="http://www.w3.org/ns/xproc" 
  xmlns:c="http://www.w3.org/ns/xproc-step"
  xmlns:tr="http://transpect.io" 
  version="1.0"
  type="tr:image-identify">
  
  <p:documentation>Read image properties from raster images.
  With Batik, it used to be able to process SVG images, but Batik was incompatible with the
  validator.nu HTML parser that is needed for HTML5 parsing. We (temporarily?) removed Batik.</p:documentation>

  <p:input port="source" primary="true" sequence="true">
    <p:documentation>Any XML document(s), or none.</p:documentation>
  </p:input>
  <p:output port="result" primary="true" sequence="true">
    <p:documentation>The input, passed thru.</p:documentation>
  </p:output>
  <p:output port="report" sequence="true">
    <p:documentation>A c:results document with a c:result element for each property. c:result contains
    a @name and a @value attribute. Property names are width, height, colorspace, mimetype,
    formatdescription, density, transparency, compressionalgorithm.</p:documentation>
  </p:output>
  <p:option name="href">
    <p:documentation>The image file’s URI.</p:documentation>
  </p:option>
  <p:option name="metadata">
    <p:documentation>Set to 'yes' to parse additional image metadata, e.g. Exif</p:documentation>
  </p:option>

</p:declare-step>
