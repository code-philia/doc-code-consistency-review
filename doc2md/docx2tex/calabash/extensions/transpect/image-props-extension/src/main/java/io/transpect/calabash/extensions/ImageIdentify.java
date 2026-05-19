package io.transpect.calabash.extensions;
/**
 * Extension for image identifying
 *
 * @author Oliver Swoboda -- le-tex publishing services GmbH
 * @author Martin Kraetke -- le-tex publishing services GmbH
 * @date   2020-07-24
 */

import java.awt.color.ColorSpace;
import java.awt.color.ICC_Profile;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Path;
import java.io.StringReader;
import java.lang.reflect.Field;
import java.net.URI;

import javax.imageio.IIOException;
import javax.imageio.ImageIO;
import javax.xml.transform.Source;
import javax.xml.transform.stream.StreamSource;

import net.sf.saxon.s9api.DocumentBuilder;
import net.sf.saxon.s9api.QName;
import net.sf.saxon.s9api.SaxonApiException;
import net.sf.saxon.s9api.XdmNode;

import org.apache.commons.imaging.ImageReadException;
import org.apache.commons.imaging.Imaging;
import org.apache.xmlgraphics.image.loader.ImageInfo;
import org.apache.xmlgraphics.image.loader.ImageManager;
import org.apache.xmlgraphics.image.loader.ImageSessionContext;
import org.apache.xmlgraphics.image.loader.impl.DefaultImageContext;
import org.apache.xmlgraphics.image.loader.impl.DefaultImageSessionContext;

import com.drew.metadata.Directory;
import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.Tag;

import com.xmlcalabash.core.XProcRuntime;
import com.xmlcalabash.core.XProcConstants;
import com.xmlcalabash.io.ReadablePipe;
import com.xmlcalabash.io.WritablePipe;
import com.xmlcalabash.library.DefaultStep;
import com.xmlcalabash.model.RuntimeValue;
import com.xmlcalabash.runtime.XAtomicStep;
import com.xmlcalabash.util.TreeWriter;
import net.sf.saxon.om.AttributeMap;
import net.sf.saxon.om.EmptyAttributeMap;
import net.sf.saxon.om.SingletonAttributeMap;
import com.xmlcalabash.util.TypeUtils;

public class ImageIdentify extends DefaultStep {

  private ReadablePipe source = null;
  private WritablePipe result = null;
  private WritablePipe report = null;
    
  private String formatDescription, mimeType, formatDetails, colorSpace, compressionAlgorithm;
  private int height;
  private int width;
  private int density;
  private int depth;
  private Boolean transparency = null;
  private Metadata metadata = null;
    
  public ImageIdentify (XProcRuntime runtime, XAtomicStep step) {
    super(runtime, step);
  }
  @Override
  public void setInput (String port, ReadablePipe pipe) {
    source = pipe;
  }
  @Override
  public void setOutput (String port, WritablePipe pipe) {
    if (port.equals("result"))
      result = pipe;
    if (port.equals("report"))
      report = pipe;
  }

  @Override
  public void reset() {
    source.resetReader();
    result.resetWriter();
    report.resetWriter();
  }
  @Override
  public void run() throws SaxonApiException {
    super.run();

    RuntimeValue rValue = getOption(new QName("href"));
    RuntimeValue getMetadata = getOption(new QName("metadata"));
    
    String href = getOption(new QName("href")).getString();
    boolean getMetadataBool = (getMetadata != null && getMetadata.getString().equals("yes")) ? true : false;
    URI uri = rValue.getBaseURI().resolve(rValue.getString());
    File file = new File(uri);

    while (source.moreDocuments()) {
      XdmNode input = source.read();
      result.write(input);
    }

    try {
      XdmNode XmlResult = imageIdentify(file, getMetadataBool);

      report.write(XmlResult);
      
    } catch(Exception e) {
      
      e.printStackTrace();
    }
	    
  }
    
  private XdmNode imageIdentify(File file, Boolean getMetadataBool) throws Exception {
    try {
      org.apache.commons.imaging.ImageInfo imageInfo = Imaging.getImageInfo(file);
      formatDescription = imageInfo.getFormatName();
      depth = imageInfo.getBitsPerPixel();
      mimeType = imageInfo.getMimeType();
      formatDetails = imageInfo.getFormatDetails();
      height = imageInfo.getHeight();
      width = imageInfo.getWidth();
      density = imageInfo.getPhysicalHeightDpi();
      compressionAlgorithm = imageInfo.getCompressionAlgorithm().toString();
      transparency = imageInfo.isTransparent();
      colorSpace = imageInfo.getColorType().toString();
      metadata = ImageMetadataReader.readMetadata(file);      
      
    } catch (Exception e) {
      ImageManager imageManager = new ImageManager(new DefaultImageContext());
      ImageSessionContext sessionContext = new DefaultImageSessionContext(imageManager.getImageContext(), null);

      ImageInfo info = imageManager.getImageInfo(file.getPath(), sessionContext);
      
      density = (int) info.getSize().getDpiHorizontal();
      mimeType = info.getMimeType();
      height = info.getSize().getHeightPx();
      width = info.getSize().getWidthPx();
    }

    return getXmlResult(file, getMetadataBool);
    // getInfo();
  }

  // no longer used, to be removed soon
  private void getColorSpace(File file) throws Exception {
    Integer colorSpaceType = null;
    try {
      BufferedImage image = Imaging.getBufferedImage(file);
      colorSpaceType  = image.getColorModel().getColorSpace().getType();
    } catch (ImageReadException er) {
      try {
        BufferedImage image = ImageIO.read(file);
        colorSpaceType = image.getColorModel().getColorSpace().getType();
      } catch (IIOException e) {
        ICC_Profile iccProfile = Imaging.getICCProfile(file);
        if (iccProfile != null) {
          colorSpaceType = iccProfile.getColorSpaceType();
        }
      }
    }
		
    for (Field field : ColorSpace.class.getDeclaredFields()) {
      if (field.getName().contains("TYPE") || field.getName().contains("CS")) {
        int value = field.getInt(null);
        if (colorSpaceType == value) {
          String name = field.getName();
          colorSpace = name.substring(name.indexOf("_")+1);
        }
      }
    }
  }

  private XdmNode getXmlResult (File file, Boolean getMetadataBool) {
    QName xml_base = new QName("xml", "http://www.w3.org/XML/1998/namespace" ,"base");
    QName c_results = new QName("c", "http://www.w3.org/ns/xproc-step" ,"results");
    QName c_name = new QName("name");
    QName c_value = new QName("value");
    TreeWriter tree = new TreeWriter(runtime);
		
    tree.startDocument(step.getNode().getBaseURI());
    tree.addStartElement(c_results,SingletonAttributeMap.of(TypeUtils.attributeInfo(new QName("name"), file.getName())));
		
		AttributeMap attrs = EmptyAttributeMap.getInstance();
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("name"), "mimetype"));
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("value"), mimeType));
    tree.addStartElement(XProcConstants.c_result,attrs);
		
    tree.addEndElement();
    if (formatDescription != null){
			attrs = EmptyAttributeMap.getInstance();
			attrs = attrs.put(TypeUtils.attributeInfo(new QName("name"), "formatdescription"));
			attrs = attrs.put(TypeUtils.attributeInfo(new QName("value"), formatDescription));
      tree.addStartElement(XProcConstants.c_result,attrs);
      tree.addEndElement();
    }
    if (formatDetails != null){
			attrs = EmptyAttributeMap.getInstance();
			attrs = attrs.put(TypeUtils.attributeInfo(new QName("name"), "formatdetails"));
			attrs = attrs.put(TypeUtils.attributeInfo(new QName("value"), formatDetails));
      tree.addStartElement(XProcConstants.c_result,attrs);
      tree.addEndElement();
    }
		attrs = EmptyAttributeMap.getInstance();
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("name"), "width"));
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("value"), String.valueOf(width) + "px"));
    tree.addStartElement(XProcConstants.c_result,attrs);
    tree.addEndElement();
		attrs = EmptyAttributeMap.getInstance();
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("name"), "depth"));
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("value"), String.valueOf(depth)));
    tree.addStartElement(XProcConstants.c_result,attrs);
    tree.addEndElement();
		attrs = EmptyAttributeMap.getInstance();
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("name"), "height"));
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("value"), String.valueOf(height) + "px"));
    tree.addStartElement(XProcConstants.c_result,attrs);
    tree.addEndElement();
		attrs = EmptyAttributeMap.getInstance();
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("name"), "density"));
    if (density == -1) {
			attrs = attrs.put(TypeUtils.attributeInfo(new QName("value"), "72dpi"));
    } else {
			attrs = attrs.put(TypeUtils.attributeInfo(new QName("value"), String.valueOf(density) + "dpi"));
    }
    tree.addStartElement(XProcConstants.c_result,attrs);
    tree.addEndElement();
    if (colorSpace != null){
		attrs = EmptyAttributeMap.getInstance();
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("name"), "colorspace"));
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("value"), colorSpace));
      tree.addStartElement(XProcConstants.c_result,attrs);
      tree.addEndElement();
    }
    if (transparency != null){
		attrs = EmptyAttributeMap.getInstance();
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("name"), "transparency"));
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("value"), String.valueOf(transparency)));
      tree.addStartElement(XProcConstants.c_result,attrs);
      tree.addEndElement();
    }
    if (compressionAlgorithm != null){
		attrs = EmptyAttributeMap.getInstance();
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("name"), "compressionalgorithm"));
		attrs = attrs.put(TypeUtils.attributeInfo(new QName("value"), compressionAlgorithm));
      tree.addStartElement(XProcConstants.c_result,attrs);
      tree.addEndElement();
    }
    if (metadata != null && getMetadataBool) {
      for (Directory directory : metadata.getDirectories()) {
        String dir = directory.getName();
				attrs = EmptyAttributeMap.getInstance();
				attrs = attrs.put(TypeUtils.attributeInfo(new QName("name"), dir));
        tree.addStartElement(XProcConstants.c_param_set,attrs);
        for (Tag tag : directory.getTags()) {
          String value = tag.getDescription();
					attrs = EmptyAttributeMap.getInstance();
					attrs = attrs.put(TypeUtils.attributeInfo(new QName("name"), tag.getTagName()));
					attrs = attrs.put(TypeUtils.attributeInfo(new QName("value"), value));
          tree.addStartElement(XProcConstants.c_param,attrs);
          tree.addEndElement();
        }
        tree.addEndElement();
      }
    }
    tree.addEndElement();
    tree.endDocument();
    return tree.getResult();
  }
}
