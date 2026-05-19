package io.transpect.calabash.extensions.subversion;

import java.io.File;
import java.io.IOException;

import net.sf.saxon.s9api.QName;
import net.sf.saxon.s9api.SaxonApiException;
import net.sf.saxon.s9api.XdmNode;

import com.xmlcalabash.core.XMLCalabash;
import com.xmlcalabash.core.XProcRuntime;
import com.xmlcalabash.core.XProcConstants;
import com.xmlcalabash.io.WritablePipe;
import com.xmlcalabash.library.DefaultStep;
import com.xmlcalabash.model.RuntimeValue;
import com.xmlcalabash.runtime.XAtomicStep;
import com.xmlcalabash.util.TreeWriter;

import org.tmatesoft.svn.core.SVNDepth;
import org.tmatesoft.svn.core.SVNURL;
import org.tmatesoft.svn.core.SVNException;
import org.tmatesoft.svn.core.wc.SVNClientManager;
import org.tmatesoft.svn.core.wc.SVNCommitClient;
import org.tmatesoft.svn.core.wc.SVNWCClient;

import io.transpect.calabash.extensions.subversion.XSvnConnect;
import io.transpect.calabash.extensions.subversion.XSvnXmlReport;
/**
 * This class provides the svn delete command as 
 * XML Calabash extension step for XProc. The class 
 * connects to a Subversion remote repository or a
 * working copy and attempts to delete the selected paths.
 *
 * @see XSvnDelete
 */
public class XSvnDelete extends DefaultStep {
  private WritablePipe result = null;
    
  public XSvnDelete(XProcRuntime runtime, XAtomicStep step) {
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
    String url = getOption(new QName("url")).getString();
    String username = getOption(new QName("username")).getString();
    String password = getOption(new QName("password")).getString();
    Boolean force = getOption(new QName("force")).getString().equals("yes") ? true : false;        
    String commitMessage = getOption(new QName("message")).getString();
    Boolean dryRun = false;
    XSvnXmlReport report = new XSvnXmlReport();
    String repo = url.split(" ")[0];
    try{
      XSvnConnect connection = new XSvnConnect(repo, username, password);
      SVNClientManager clientmngr = connection.getClientManager();
      String baseURI = connection.isRemote() ? repo : connection.getPath();
      SVNCommitClient commitClient = clientmngr.getCommitClient();
      SVNWCClient client = clientmngr.getWCClient();
      String[] urls = url.split(" ");
      for(int i = 0; i < urls.length; i++) {
        String currentPath = urls[i];
        if( connection.isRemote() ){
          SVNURL[] svnurl = { SVNURL.parseURIEncoded( currentPath )};
          commitClient.doDelete(svnurl, commitMessage);
        } else {
          File fullPath = new File( currentPath );
          client.doDelete(fullPath, force, dryRun);
        }
      }
      XdmNode xmlResult = report.createXmlResult(baseURI, "delete", urls, runtime, step);
      result.write(xmlResult);
    } catch(SVNException|IOException svne) {
      System.out.println(svne.getMessage());
      XdmNode xmlError = report.createXmlError(svne.getMessage(), runtime, step);
      result.write(xmlError);
    }
  }
}
