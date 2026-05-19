package io.transpect.calabash.extensions;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Iterator;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.metadata.IIOMetadata;
import javax.imageio.metadata.IIOMetadataNode;
import javax.imageio.stream.ImageOutputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;

import net.sf.saxon.s9api.QName;
import net.sf.saxon.s9api.SaxonApiException;
import net.sf.saxon.om.AttributeMap;
import net.sf.saxon.om.EmptyAttributeMap;

import org.apache.commons.codec.binary.Base64;
import org.apache.commons.imaging.ImageInfo;
import org.apache.commons.imaging.ImageReadException;
import org.apache.commons.imaging.Imaging;
import org.w3c.dom.Element;

import com.twelvemonkeys.image.ResampleOp;
import com.xmlcalabash.core.XProcConstants;
import com.xmlcalabash.core.XProcRuntime;
import com.xmlcalabash.io.ReadablePipe;
import com.xmlcalabash.io.WritablePipe;
import com.xmlcalabash.library.DefaultStep;
import com.xmlcalabash.runtime.XAtomicStep;
import com.xmlcalabash.util.TreeWriter;
import com.xmlcalabash.util.TypeUtils;

public class ImageTransform extends DefaultStep {
	
	protected final static QName _href = new QName("", "href");
	protected final static QName _resize = new QName("", "resize");
	protected final static QName _media_type = new QName("", "media-type");
	protected final static QName _quality = new QName("", "quality");
	protected final static QName _target_dpi = new QName("", "target-dpi");

	protected final static QName c_error = new QName("c", XProcConstants.NS_XPROC_STEP, "error");
	protected final static QName c_data = new QName("c", XProcConstants.NS_XPROC_STEP, "data");
	
	private ReadablePipe mySource = null;
    private WritablePipe myResult = null;
    
    private TreeWriter tree = new TreeWriter(runtime);

	public ImageTransform(XProcRuntime runtime, XAtomicStep step) {
		super(runtime, step);
	}

	@Override
    public void setInput (String port, ReadablePipe pipe) {
        mySource = pipe;
    }

    @Override
    public void setOutput (String port, WritablePipe pipe) {
    		myResult = pipe;
    }

    @Override
    public void reset() {
        mySource.resetReader();
        myResult.resetWriter();
    }
    
    @Override
    public void run() throws SaxonApiException {
        super.run();
        
    	String href = getOption(_href).getString();
    	
	    File file = new File(href);
	    if (file.exists()) {
	    	imageTransform(file);
	    } else {
	    	tree.startDocument(step.getNode().getBaseURI());
	    	tree.addStartElement(c_error);
	    	tree.addText("No file found");
	    	tree.endDocument();
	    	myResult.write(tree.getResult());
	    }    	
    }
    
    public void imageTransform(File file) {
    	try {
			BufferedImage image = ImageIO.read(file);
			BufferedImage resizedImage = image;
			int width = image.getWidth();
			int height = image.getHeight();
			double ratio = (double)width/height;
			boolean onlyLarger = false;
			boolean percentage = false;
			
			String resize = getOption(_resize).getString();
			if (resize.contains(">")) {
				resize = resize.replace(">", "");
				onlyLarger = true;
			}
			
			if (resize.contains("%")) {
				resize = resize.replace("%", "");
				percentage = true;
			}
			
			if (resize.contains("@")) {				
				int targetSize = Integer.parseInt(resize.replace("@", ""));
				double currentSize = height*width;
				
				if (!onlyLarger || targetSize < currentSize) {
					double scale = Math.sqrt(targetSize/currentSize);
					resizedImage = new ResampleOp((int)(width*scale), (int)(height*scale), ResampleOp.FILTER_LANCZOS).filter(image, null);
				}
			} else if (resize.contains("x")) {
				String[] split = resize.split("x");
				if (split.length > 0) {
					Integer targetWidth = split[0].equals("") ? null : percentage ? (int)(width*Double.parseDouble(split[0])/100) : Integer.parseInt(split[0]);
					Integer targetHeight = split.length == 1 ? targetWidth == null ? null : (int)(targetWidth/ratio) : percentage ? (int)(height*Double.parseDouble(split[1])/100) : Integer.parseInt(split[1]);
					
					if (targetWidth == null && targetHeight != null) {
						targetWidth = (int)(targetHeight*ratio);
					}
					
					if (targetWidth != null && targetHeight != null) {
						if  (!onlyLarger || targetWidth*targetHeight < width*height) {
							resizedImage = new ResampleOp(targetWidth, targetHeight, ResampleOp.FILTER_LANCZOS).filter(image, null);
						}
					}
				}
			} else if (percentage) {
				double pct = Double.parseDouble(resize)/100;
				resizedImage = new ResampleOp((int)(width*pct), (int)(height*pct), ResampleOp.FILTER_LANCZOS).filter(image, null);
			} else {
				int targetWidth = Integer.parseInt(resize);
				int targetHeight = (int)(targetWidth/ratio);
				resizedImage = new ResampleOp(targetWidth, targetHeight, ResampleOp.FILTER_LANCZOS).filter(image, null);
			}

			String mediaType = getOption(_media_type).getString();
			String format = mediaType.split("/")[1];
			
			int dpi = 72;
			if (getOption(_target_dpi) != null) {
				dpi = getOption(_target_dpi).getInt();
			} else {
				ImageInfo imageInfo = Imaging.getImageInfo(file);
				dpi = imageInfo.getPhysicalHeightDpi();
			}
			
			ByteArrayOutputStream baos = new ByteArrayOutputStream();		
			float quality = Float.parseFloat(getOption(_quality).getString().replace("%", ""))/100;
			write(resizedImage, baos, format, quality, dpi);
			
			byte[] bytes = baos.toByteArray();
			String base64 = Base64.encodeBase64String(bytes);
			tree.startDocument(step.getNode().getBaseURI());
			tree.addStartElement(c_data);
      AttributeMap attrs = EmptyAttributeMap.getInstance();
      attrs = attrs.put(TypeUtils.attributeInfo(new QName("content-type"), mediaType));
      attrs = attrs.put(TypeUtils.attributeInfo(new QName("encoding"), "base64"));
			tree.addText(base64);
			tree.addEndElement();
			tree.endDocument();
			
			myResult.write(tree.getResult());
		} catch (IOException e) {
			e.printStackTrace();
		} catch (ImageReadException e) {
			e.printStackTrace();
		}    	
    }
    
    private void write(BufferedImage bufferedImage, OutputStream outputStream, String format, float quality, int dpi) throws IOException {
	    Iterator<ImageWriter> iterator = ImageIO.getImageWritersByFormatName(format);
	    ImageWriter imageWriter = iterator.next();
	    ImageWriteParam imageWriteParam = imageWriter.getDefaultWriteParam();
    	IIOMetadata metadata = imageWriter.getDefaultImageMetadata(new ImageTypeSpecifier(bufferedImage), imageWriteParam);
    	
		if (format.equals("jpg")) {
			imageWriteParam.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
	    	imageWriteParam.setCompressionQuality(quality);
	    	
    		Element tree = (Element)metadata.getAsTree("javax_imageio_jpeg_image_1.0");
    		Element jfif = (Element)tree.getElementsByTagName("app0JFIF").item(0);
    		
    		jfif.setAttribute("Xdensity", Integer.toString(dpi));
    		jfif.setAttribute("Ydensity", Integer.toString(dpi));
    		jfif.setAttribute("resUnits", "1"); // density is dots per inch
    		
    		metadata.setFromTree("javax_imageio_jpeg_image_1.0", tree);
		} else if (format.equals("png")) {
    		double dotsPerMilli = 1.0 * dpi / 10 / 2.54;
    		
    		IIOMetadataNode horiz = new IIOMetadataNode("HorizontalPixelSize");
    	    horiz.setAttribute("value", Double.toString(dotsPerMilli));

    	    IIOMetadataNode vert = new IIOMetadataNode("VerticalPixelSize");
    	    vert.setAttribute("value", Double.toString(dotsPerMilli));

    	    IIOMetadataNode dim = new IIOMetadataNode("Dimension");
    	    dim.appendChild(horiz);
    	    dim.appendChild(vert);

    	    IIOMetadataNode root = new IIOMetadataNode("javax_imageio_1.0");
    	    root.appendChild(dim);

    	    metadata.mergeTree("javax_imageio_1.0", root);
		}
    	
	    ImageOutputStream imageOutputStream = new MemoryCacheImageOutputStream(outputStream);
	    imageWriter.setOutput(imageOutputStream);
	    IIOImage iioimage = new IIOImage(bufferedImage, null, metadata);
	    imageWriter.write(null, iioimage, imageWriteParam);
	    imageOutputStream.flush();
    }
}
