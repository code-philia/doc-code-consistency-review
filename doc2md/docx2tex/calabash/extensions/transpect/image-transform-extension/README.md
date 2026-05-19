# image-transform-extension
XML Calabash extension to convert images

The step takes an XML input document on the `source` port and transforms the image which
can be passed with the `href` option. Resize expects a subset of ImageMagick's resize options. 

```xml
<tr:image-transform name="image-transform">
  <p:with-option name="href" select="//dbk:imagedata[2]/@fileref"/>
  <p:with-option name="resize" select="'75%'"/>
</tr:image-transform>
```
