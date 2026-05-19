# image-props-extension
XML Calabash extension step for reading image properties such as width

An XML Calabash extension for extracting image information
from PNG, JPEG, SVG etc. Whereas SVG is currently unsupported
due to an incompatibility between Batik and validator.nu’s
htmlparser.

Written by Oliver Swoboda, le-tex publishing services GmbH
(small portions also by Gerrit Imsieke)

It requires several Apache libraries that are bundled with this repo.

xmlgraphics-commons-1.5.jar
commons-imaging-1.0-SNAPSHOT.jar

For SVG analysis, it needs 

 * batik-1.7/*
 * fop.jar

See http://www.apache.org/licenses/LICENSE-2.0.txt for the libraries'
licenses.

Usage example (from the checked-out directory):

calabash/calabash.sh extensions/transpect/ltx-image-identify/ltx-example.xpl

It requires
[calabash-distro](https://github.com/transpect/calabash-distro) and
[calabash-frontend](https://github.com/transpect/calabash-frontend) to
be installed (for example, by installing calabash-frontend with
recursive submodule checkout).

Step signature:

```xml
<p:declare-step type="tr:image-identify">
  <p:input port="source" primary="true" sequence="true"/>
  <p:output port="result" primary="true" sequence="true"/>
  <p:output port="report" sequence="true"/>
  <p:option name="href"/>
</p:declare-step>
```

tr:image-identify passes documents from its source to its result
port (this is because the step is better chainable this way). As a
side effect, it will create a c:results document with image properties
on the report port. The result (er, report) of the sample invocation
above looks like this:

```xml
<c:results xmlns:c="http://www.w3.org/ns/xproc-step" name="logo-letex.png">
  <c:result name="mimetype" value="image/png"/>
  <c:result name="formatdescription" value="PNG Portable Network Graphics"/>
  <c:result name="formatdetails" value="Png"/>
  <c:result name="width" value="142px"/>
  <c:result name="height" value="58px"/>
  <c:result name="density" value="-1dpi"/>
  <c:result name="colorspace" value="RGB"/>
  <c:result name="transparency" value="false"/>
  <c:result name="compressionalgorithm" value="PNG Filter"/>
</c:results>
<c:results xmlns:c="http://www.w3.org/ns/xproc-step" name="le-tex_venn.svg">
  <c:result name="mimetype" value="image/svg+xml"/>
  <c:result name="width" value="1000px"/>
  <c:result name="height" value="700px"/>
  <c:result name="density" value="96dpi"/>
</c:results>
```

You can also print additional image metadata like Exif when you set the option
`metadata` to `yes`.

```xml
<c:results xmlns:c="http://www.w3.org/ns/xproc-step" name="olympus-c960.jpg">
  <c:result name="formatdescription" value="JPEG (Joint Photographic Experts Group) Format"/>
  <c:result name="formatdetails" value="Jpeg/DCM"/>
  <c:result name="width" value="640"/>
  <c:result name="height" value="480"/>
  <c:result name="density" value="72dpi"/>
  <c:result name="colorspace" value="YCbCr"/>
  <c:result name="transparency" value="false"/>
  <c:result name="compressionalgorithm" value="JPEG"/>
  <c:param-set name="JPEG">
    <c:param name="Compression Type" value="Baseline"/>
    <c:param name="Data Precision" value="8 bits"/>
    <c:param name="Image Height" value="480 pixels"/>
    <c:param name="Image Width" value="640 pixels"/>
    <c:param name="Number of Components" value="3"/>
    <c:param name="Component 1" value="Y component: Quantization table 0, Sampling factors 2 horiz/2 vert"/>
    <c:param name="Component 2" value="Cb component: Quantization table 1, Sampling factors 1 horiz/1 vert"/>
    <c:param name="Component 3" value="Cr component: Quantization table 1, Sampling factors 1 horiz/1 vert"/>
  </c:param-set>
  <c:param-set name="Exif IFD0">
    <c:param name="Image Description" value="OLYMPUS DIGITAL CAMERA         "/>
    <c:param name="Make" value="OLYMPUS OPTICAL CO.,LTD"/>
    <c:param name="Model" value="C960Z,D460Z"/>
    <c:param name="Orientation" value="Top, left side (Horizontal / normal)"/>
    <c:param name="X Resolution" value="72 dots per inch"/>
    <c:param name="Y Resolution" value="72 dots per inch"/>
    <c:param name="Resolution Unit" value="Inch"/>
    <c:param name="Software" value="OLYMPUS CAMEDIA Master"/>
    <c:param name="Date/Time" value="2000:11:08 20:14:38"/>
    <c:param name="YCbCr Positioning" value="Datum point"/>
  </c:param-set>
  <c:param-set name="Exif SubIFD">
    <c:param name="Exposure Time" value="1/345 sec"/>
    <c:param name="F-Number" value="f/8,0"/>
    <c:param name="Exposure Program" value="Program normal"/>
    <c:param name="ISO Speed Ratings" value="125"/>
    <c:param name="Exif Version" value="2.10"/>
    <c:param name="Date/Time Original" value="2000:11:07 10:41:43"/>
    <c:param name="Date/Time Digitized" value="2000:11:07 10:41:43"/>
    <c:param name="Components Configuration" value="YCbCr"/>
    <c:param name="Compressed Bits Per Pixel" value="1 bit/pixel"/>
    <c:param name="Exposure Bias Value" value="0 EV"/>
    <c:param name="Max Aperture Value" value="f/2,8"/>
    <c:param name="Metering Mode" value="Multi-segment"/>
    <c:param name="White Balance" value="Unknown"/>
    <c:param name="Flash" value="Flash did not fire"/>
    <c:param name="Focal Length" value="5,6 mm"/>
    <c:param name="User Comment" value=""/>
    <c:param name="FlashPix Version" value="1.00"/>
    <c:param name="Color Space" value="sRGB"/>
    <c:param name="Exif Image Width" value="1280 pixels"/>
    <c:param name="Exif Image Height" value="960 pixels"/>
    <c:param name="File Source" value="Digital Still Camera (DSC)"/>
    <c:param name="Scene Type" value="Directly photographed image"/>
  </c:param-set>
  <c:param-set name="Olympus Makernote">
    <c:param name="JPEG Quality" value="Super High Quality (Fine)"/>
    <c:param name="Macro" value="Normal (no macro)"/>
    <c:param name="BW Mode" value="Off"/>
    <c:param name="Digital Zoom" value="0"/>
    <c:param name="Focal Plane Diagonal" value="6,64 mm"/>
    <c:param name="Lens Distortion Parameters" value="-283 -524 -571 -267 -485 -518"/>
    <c:param name="Camera Type" value="C960Z,D460Z"/>
    <c:param name="Camera Id" value="OLYMPUS DIGITAL CAMERA"/>
  </c:param-set>
  <c:param-set name="Interoperability">
    <c:param name="Interoperability Index" value="Recommended Exif Interoperability Rules (ExifR98)"/>
    <c:param name="Interoperability Version" value="1.00"/>
  </c:param-set>
  <c:param-set name="Exif Thumbnail">
    <c:param name="Compression" value="JPEG (old-style)"/>
    <c:param name="X Resolution" value="72 dots per inch"/>
    <c:param name="Y Resolution" value="72 dots per inch"/>
    <c:param name="Resolution Unit" value="Inch"/>
    <c:param name="Thumbnail Offset" value="2012 bytes"/>
    <c:param name="Thumbnail Length" value="5145 bytes"/>
  </c:param-set>
  <c:param-set name="Huffman">
    <c:param name="Number of Tables" value="4 Huffman tables"/>
  </c:param-set>
  <c:param-set name="File Type">
    <c:param name="Detected File Type Name" value="JPEG"/>
    <c:param name="Detected File Type Long Name" value="Joint Photographic Experts Group"/>
    <c:param name="Detected MIME Type" value="image/jpeg"/>
    <c:param name="Expected File Name Extension" value="jpg"/>
  </c:param-set>
  <c:param-set name="File">
    <c:param name="File Name" value="olympus-c960.jpg"/>
    <c:param name="File Size" value="87599 bytes"/>
    <c:param name="File Modified Date" value="Fri Jul 24 13:19:55 +02:00 2020"/>
  </c:param-set>
</c:results>
```

## Compilation (Unix paths):

```
javac -target 1.8 \
  -cp ../../../distro/xmlcalabash-1.3.2-100.jar:lib/xmlgraphics-commons-1.5.jar:lib/commons-imaging-1.0-alpha2.jar:lib/metadata-extractor-2.18.0.jar:lib/xmpcore-6.0.6.jar \
  src/main/java/io/transpect/calabash/extensions/ImageIdentify.java
```
   
### On Cygwin:

```
/cygdrive/c/Program\ Files\ \(x86\)/Java/jdk1.7.0_40/bin/javac \
  -cp $(cygpath -map ../../../calabash.jar:xmlgraphics-commons-1.5.jar:commons-imaging-1.0-SNAPSHOT.jar) \
  ImageIdentify.java
```

