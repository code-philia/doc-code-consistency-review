package io.transpect.calabash.extensions.subversion;

import java.util.Collection;
import java.util.Iterator;

import java.io.File;
import java.io.IOException;

import net.sf.saxon.s9api.QName;
import net.sf.saxon.s9api.SaxonApiException;
import net.sf.saxon.s9api.XdmNode;

import com.xmlcalabash.core.XMLCalabash;
import com.xmlcalabash.core.XProcRuntime;
import com.xmlcalabash.io.WritablePipe;
import com.xmlcalabash.library.DefaultStep;
import com.xmlcalabash.model.RuntimeValue;
import com.xmlcalabash.runtime.XAtomicStep;
import com.xmlcalabash.util.TreeWriter;

import org.tmatesoft.svn.core.SVNLock;
import org.tmatesoft.svn.core.SVNNodeKind;
import org.tmatesoft.svn.core.SVNDirEntry;
import org.tmatesoft.svn.core.SVNException;
import org.tmatesoft.svn.core.io.SVNRepository;
import org.tmatesoft.svn.core.wc.SVNClientManager;
import org.tmatesoft.svn.core.wc.SVNWCClient;

import io.transpect.calabash.extensions.subversion.XSvnConnect;
import io.transpect.calabash.extensions.subversion.XSvnXmlReport;
/**
 * Performs svn ls as XML Calabash extension step for
 * XProc. The class connects to a Subversion repository and
 * provides the results as XML document.
 *
 * @see XSvnConnect
 */
public class XSvnList extends DefaultStep {
  private WritablePipe result = null;

  public XSvnList(XProcRuntime runtime, XAtomicStep step) {
    super(runtime,step);
  }
  @Override
  public void setOutput(String port, WritablePipe pipe) {
    result = pipe;
  }
  @Override
  public void reset() {
    result.resetWriter();
  }
  @Override
  public void run() throws SaxonApiException {
    super.run();
    String url = getOption(new QName("repo")).getString();
    String username = getOption(new QName("username")).getString();
    String password = getOption(new QName("password")).getString();
    Boolean recursive = getOption(new QName("recursive")).getString().equals("yes") ? true : false;
    XSvnXmlReport report = new XSvnXmlReport();
    XdmNode xmlResult;
    try{
      XSvnConnect connection = new XSvnConnect(url, username, password);
      if(connection.isRemote()){
        SVNRepository repository = connection.getRepository();
        xmlResult = createXmlDirTree(repository, runtime, step, recursive);
        result.write(xmlResult);
      } else {
        File path = new File(new File(url).getCanonicalPath());
        SVNClientManager clientmngr = connection.getClientManager();
        SVNWCClient client = clientmngr.getWCClient();
        xmlResult = createXmlDirTree(path, client, runtime, step, recursive);
        result.write(xmlResult);
      }
    } catch (SVNException | IOException e){
      System.out.println(e.getMessage());
      XdmNode xmlError = report.createXmlError(e.getMessage(), runtime, step);
      result.write(xmlError);
    }
  }
  public static XdmNode createXmlDirTree(File path, SVNWCClient client, XProcRuntime runtime, XAtomicStep step, Boolean recursive) throws SVNException {
    TreeWriter tree = new TreeWriter(runtime);
    tree.startDocument(step.getNode().getBaseURI());
    tree.addStartElement(new QName("c", "http://www.w3.org/ns/xproc-step", "files"));
    tree.addAttribute(new QName("xml", "http://www.w3.org/XML/1998/namespace", "base"), path.toURI().toString());
    listEntries(path, client, runtime, step, tree, recursive);
    tree.addEndElement();
    tree.endDocument();
    return tree.getResult();
  }
  public static TreeWriter listEntries(File path, SVNWCClient client, XProcRuntime runtime, XAtomicStep step, TreeWriter tree, Boolean recursive) throws SVNException {
    File[] dirList = path.listFiles();
    if( path.isDirectory() && dirList != null ) {
      for (File child : dirList ) {
        String elementName = child.isDirectory() ? "directory" : "file";
        tree.addStartElement(new QName("c", "http://www.w3.org/ns/xproc-step", elementName));
        tree.addAttribute(new QName("name"), child.getName());
        if(!child.isDirectory()) {
          tree.addAttribute(new QName("size"), String.valueOf(child.length() / 1024));
        }
        if(child.isDirectory() && recursive) {
          listEntries(child, client, runtime, step, tree, recursive);
        }
        tree.addEndElement();
      }
    }
    return tree;
  }
  public static XdmNode createXmlDirTree(SVNRepository repository, XProcRuntime runtime, XAtomicStep step, Boolean recursive) throws SVNException {
    TreeWriter tree = new TreeWriter(runtime);
    tree.startDocument(step.getNode().getBaseURI());
    tree.addStartElement(new QName("c", "http://www.w3.org/ns/xproc-step", "files"));
    tree.addAttribute(new QName("xml", "http://www.w3.org/XML/1998/namespace", "base"), repository.getLocation().toString());
    listEntries(repository, "", runtime, step, tree, recursive);
    tree.addEndElement();
    tree.endDocument();
    return tree.getResult();
  }  
  public static TreeWriter listEntries(SVNRepository repository, String path, XProcRuntime runtime, XAtomicStep step, TreeWriter tree, Boolean recursive) throws SVNException {
    Collection entries = repository.getDir( path, -1 , null , (Collection) null );
    Iterator iterator = entries.iterator( );
    String repositoryRootURL = repository.getRepositoryRoot(true).toString();
    while ( iterator.hasNext( ) ) {
      SVNDirEntry entry = (SVNDirEntry) iterator.next( );
      String elementName = entry.getKind() == SVNNodeKind.DIR ? "directory" : "file";
      String entryURL = entry.getURL().toString();
      String entryRelPath = entryURL.replace(repositoryRootURL, "");
      tree.addStartElement(new QName("c", "http://www.w3.org/ns/xproc-step", elementName));
      tree.addAttribute(new QName("name"), entry.getName());
      tree.addAttribute(new QName("author"), entry.getAuthor());
      tree.addAttribute(new QName("date"), entry.getDate().toString());
      tree.addAttribute(new QName("revision"), String.valueOf(entry.getRevision()));
      if( entry.getKind() == SVNNodeKind.FILE ){
        SVNLock lock = repository.getLock( entryRelPath );
        tree.addAttribute(new QName("size"), String.valueOf(entry.getSize()));      
        if( lock != null ) {
          tree.addAttribute(new QName("lock-id"), lock.getID());
          tree.addAttribute(new QName("lock-path"), lock.getPath());
          tree.addAttribute(new QName("lock-owner"), lock.getOwner());
          tree.addAttribute(new QName("lock-created"), lock.getCreationDate().toString());
          if( lock.getExpirationDate() != null ) {
            tree.addAttribute(new QName("lock-expires"), lock.getExpirationDate().toString());
          }
          if( lock.getComment() != null ) {
            tree.addAttribute(new QName("lock-comment"), lock.getComment());
          }
        }
      }
      if ( entry.getKind() == SVNNodeKind.DIR && recursive == true ) {
        listEntries(repository, (path.equals( "" )) ? entry.getName( ) : path + "/" + entry.getName( ), runtime, step, tree, recursive);
      }
      tree.addEndElement();
    }
    return tree;
  }
}
