<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet 
  xmlns:html="http://www.w3.org/1999/xhtml"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="3.0"
  xmlns="http://www.w3.org/1999/xhtml"
  exclude-result-prefixes="xs html">
  
  <!-- process listings as produced by 
       svn ls -R -\-xml -\-include-externals 
       A flaw of the generated XML is that the URL of an external is not included.
       So it is generally not possible to link to the external in the listing.
       If you happen to know a common parent directory of all externals, you
       can pass it as $external-base-url.
  -->

  <xsl:param name="external-base-url" as="xs:string?"/>

  <xsl:mode on-no-match="shallow-copy"/>
  
  <xsl:output method="xhtml"/>
  
  <xsl:template match="/lists">
    <html>
      <head>
        <title>Subversion Repository Listing</title>
        <style>
          details, p.no-child {
            margin-left: 1em;
          }
          p {
            margin:0;
          }
          p.no-child.dir {
            margin-left: 2em;
          }
          summary {
            cursor: pointer;
          }
          body .list {
            margin-top: 1em;
            margin-left: -1em;
          }
        </style>
      </head>
      <body>
        <h1>Subversion Repository Listing</h1>
        <p>Generated <xsl:sequence select="format-dateTime(current-dateTime(), '[Y0001]-[M01]-[D01] [H01]:[m01] [z]')"/></p>
        <xsl:variable name="prelim" as="document-node()">
          <xsl:document>
            <xsl:apply-templates/>
          </xsl:document>
        </xsl:variable>
        <xsl:apply-templates select="$prelim"/>
      </body>
    </html>
  </xsl:template>
  
  <xsl:template match="html:details[every $c in * satisfies $c/self::html:summary]">
    <p class="no-child {@class}">
      <xsl:apply-templates select="html:summary/node()" mode="#current"/>
    </p>
  </xsl:template>
  
  <xsl:key name="by-parent_url" match="external" use="@parent_url"/>
  
  <xsl:template match="list" priority="1">
    <div class="list">
      <xsl:next-match>
        <xsl:with-param name="base-url" as="xs:string" select="@path" tunnel="yes"/>
      </xsl:next-match>  
    </div>
  </xsl:template>
  
  <xsl:template match="list" name="entries">
    <xsl:param name="depth" select="1" as="xs:integer"/>
    <xsl:param name="entries" select="entry" as="element(entry)*"/>
    <xsl:param name="base-url" as="xs:string" tunnel="yes"/>
<!--    <ul>-->
      <xsl:for-each-group select="$entries" group-by="tokenize(name, '/')[$depth]">
        <details class="{@kind}">
        <summary>
          <a href="{$base-url}/{name}">
            <xsl:apply-templates select="." mode="title-att"/>
            <xsl:value-of select="current-grouping-key()"/>
          </a>
        </summary>
          <xsl:call-template name="externals">
            <xsl:with-param name="parent-url" as="xs:string" 
              select="$base-url || '/' || string-join(tokenize(name, '/')[position() le $depth], '/')"/>
          </xsl:call-template>
          <xsl:if test="tokenize(current-group()[2]/name, '/')[$depth + 1]">
            <xsl:call-template name="entries">
              <xsl:with-param name="depth" select="$depth + 1"/>
              <xsl:with-param name="entries" select="current-group()"/>
            </xsl:call-template>
          </xsl:if>
        </details>
      </xsl:for-each-group>
    <!--</ul>-->
  </xsl:template>
  
  <xsl:template name="externals">
    <xsl:param name="parent-url" as="xs:string"/>
    <xsl:variable name="exts" as="element(external)*" select="key('by-parent_url', $parent-url)"/>
    <xsl:if test="exists($exts)">
      <xsl:apply-templates select="$exts" mode="#current"/>
    </xsl:if>
  </xsl:template>
  
  <xsl:template match="external">
    <details>
      <summary>
        <xsl:choose>
          <xsl:when test="$external-base-url">
            <a href="{$external-base-url}/{@target}">
              <xsl:value-of select="@target"/>
            </a>
          </xsl:when>
          <xsl:otherwise>
            <xsl:value-of select="@target"/>
          </xsl:otherwise>
        </xsl:choose>
      </summary>
      <xsl:call-template name="entries">
        <xsl:with-param name="depth" select="1"/>
        <xsl:with-param name="entries" select="entry"/>
        <xsl:with-param name="base-url" select="$external-base-url || '/' || @target" tunnel="yes"/>
      </xsl:call-template>
    </details>
  </xsl:template>
  
  <xsl:template match="entry " mode="title-att">
    <xsl:attribute name="title" separator=" ">
      <xsl:apply-templates select="commit/(@revision, author, date), size" mode="#current"/>
    </xsl:attribute>
  </xsl:template>
  
  <xsl:template match="@revision | author | date | size" mode="title-att">
    <xsl:sequence select="string-join((name(), string(.)), ':')"/>
  </xsl:template>
  
</xsl:stylesheet>