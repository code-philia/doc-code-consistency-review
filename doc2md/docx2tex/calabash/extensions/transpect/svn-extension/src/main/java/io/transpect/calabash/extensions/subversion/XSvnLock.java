package io.transpect.calabash.extensions.subversion;

import java.util.Collection;
import java.util.Iterator;

import java.io.File;

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

import org.tmatesoft.svn.core.SVNURL;
import org.tmatesoft.svn.core.SVNException;
import org.tmatesoft.svn.core.wc.SVNClientManager;
import org.tmatesoft.svn.core.wc.SVNWCClient;

import io.transpect.calabash.extensions.subversion.XSvnConnect;
import io.transpect.calabash.extensions.subversion.XSvnXmlReport;
/**
 * Performs svn lock and unlock as XML Calabash extension step for
 * XProc. The class connects to a Subversion repository and
 * provides the results as XML document.
 *
 * @see XSvnLock
 */
public class XSvnLock extends DefaultStep {
  private WritablePipe result = null;

  public XSvnLock(XProcRuntime runtime, XAtomicStep step) {
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
    String paths = getOption(new QName("path")).getString();
    String[] pathsArr = paths.split(" ");
    Boolean unlock = getOption(new QName("unlock")).getString().equals("yes") ? true : false;
    Boolean breakLock = getOption(new QName("break-lock")).getString().equals("yes") ? true : false;
    String message = getOption(new QName("message")).getString();
    XSvnXmlReport report = new XSvnXmlReport();
    try{
      XSvnConnect connection = new XSvnConnect(url, username, password);
      SVNClientManager clientmngr = connection.getClientManager();
      SVNWCClient client = clientmngr.getWCClient();
      for (int i = 0; i < pathsArr.length; i++){
        pathsArr[i] = url + "/" + pathsArr[i];
      }
      if(connection.isRemote()){
        SVNURL[] svnUrlArr = new SVNURL[pathsArr.length];
        for (int i = 0; i < pathsArr.length; i++){
          svnUrlArr[i] = SVNURL.parseURIEncoded(pathsArr[i]);
        }
        if(unlock){
          client.doUnlock(svnUrlArr, breakLock);
        } else {
          client.doLock(svnUrlArr, breakLock, message);
        }
      } else {
        File[] filesArr = null;
        for (int i = 0; i < pathsArr.length; i++){
          filesArr[i] = new File(pathsArr[i]);
        }
        if(unlock){
          client.doUnlock(filesArr, breakLock);
        } else {
          client.doLock(filesArr, breakLock, message);
        }
      }
      XdmNode xmlResult = report.createXmlResult(url, ( unlock ? "unlock" : "lock" ), pathsArr, runtime, step);
      result.write(xmlResult);
    } catch (SVNException svne){
      System.out.println(svne.getMessage());
      XdmNode xmlError = report.createXmlError(svne.getMessage(), runtime, step);
      result.write(xmlError);
    }
  }
}
