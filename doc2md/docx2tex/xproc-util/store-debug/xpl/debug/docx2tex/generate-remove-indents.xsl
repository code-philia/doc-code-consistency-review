<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet xmlns:c="http://www.w3.org/ns/xproc-step"
                xmlns:css="http://www.w3.org/1996/css"
                xmlns:dbk="http://docbook.org/ns/docbook"
                xmlns:docx2tex="http://transpect.io/docx2tex"
                xmlns:html="http://www.w3.org/1999/xhtml"
                xmlns:mml2tex="http://transpect.io/mml2tex"
                xmlns:svg="http://www.w3.org/2000/svg"
                xmlns:tr="http://transpect.io"
                xmlns:xlink="http://www.w3.org/1999/xlink"
                xmlns:xml2tex="http://transpect.io/xml2tex"
                xmlns:xs="http://www.w3.org/2001/XMLSchema"
                xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                version="2.0"><!--Remove margin-left and text-indent in order to avoid generation of list-styles-->
   <xsl:template match="dbk:para[@role = ('berschrift1', 'headline1', 'heading1', 'Heading1')]"
                 priority="53">
      <xsl:copy>
         <xsl:attribute name="docx2tex:config" select="'headline'"/>
         <xsl:apply-templates select="@*, node()"/>
      </xsl:copy>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('berschrift1', 'headline1', 'heading1', 'Heading1')]/dbk:phrase[@role eq 'hub:identifier']/@role"
                 priority="53">
      <xsl:attribute name="role" select="'docx2tex:identifier'"/>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('berschrift1', 'headline1', 'heading1', 'Heading1')]/@css:margin-left|dbk:para[@role = ('berschrift1', 'headline1', 'heading1', 'Heading1')]/@css:text-indent"
                 priority="53"/>
   <xsl:template match="dbk:para[@role = ('berschrift1', 'headline1', 'heading1', 'Heading1')]/dbk:tab"
                 priority="53">
      <phrase xmlns="http://docbook.org/ns/docbook" role="tab">
         <xsl:text/>
      </phrase>
   </xsl:template>
   <!--Remove margin-left and text-indent in order to avoid generation of list-styles-->
   <xsl:template match="dbk:para[@role = ('berschrift2', 'headline2', 'heading2', 'Heading2')]"
                 priority="54">
      <xsl:copy>
         <xsl:attribute name="docx2tex:config" select="'headline'"/>
         <xsl:apply-templates select="@*, node()"/>
      </xsl:copy>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('berschrift2', 'headline2', 'heading2', 'Heading2')]/dbk:phrase[@role eq 'hub:identifier']/@role"
                 priority="54">
      <xsl:attribute name="role" select="'docx2tex:identifier'"/>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('berschrift2', 'headline2', 'heading2', 'Heading2')]/@css:margin-left|dbk:para[@role = ('berschrift2', 'headline2', 'heading2', 'Heading2')]/@css:text-indent"
                 priority="54"/>
   <xsl:template match="dbk:para[@role = ('berschrift2', 'headline2', 'heading2', 'Heading2')]/dbk:tab"
                 priority="54">
      <phrase xmlns="http://docbook.org/ns/docbook" role="tab">
         <xsl:text/>
      </phrase>
   </xsl:template>
   <!--Remove margin-left and text-indent in order to avoid generation of list-styles-->
   <xsl:template match="dbk:para[@role = ('berschrift3', 'headline3', 'heading3', 'Heading3')]"
                 priority="55">
      <xsl:copy>
         <xsl:attribute name="docx2tex:config" select="'headline'"/>
         <xsl:apply-templates select="@*, node()"/>
      </xsl:copy>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('berschrift3', 'headline3', 'heading3', 'Heading3')]/dbk:phrase[@role eq 'hub:identifier']/@role"
                 priority="55">
      <xsl:attribute name="role" select="'docx2tex:identifier'"/>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('berschrift3', 'headline3', 'heading3', 'Heading3')]/@css:margin-left|dbk:para[@role = ('berschrift3', 'headline3', 'heading3', 'Heading3')]/@css:text-indent"
                 priority="55"/>
   <xsl:template match="dbk:para[@role = ('berschrift3', 'headline3', 'heading3', 'Heading3')]/dbk:tab"
                 priority="55">
      <phrase xmlns="http://docbook.org/ns/docbook" role="tab">
         <xsl:text/>
      </phrase>
   </xsl:template>
   <!--Remove margin-left and text-indent in order to avoid generation of list-styles-->
   <xsl:template match="dbk:para[@role = ('berschrift4', 'headline4', 'heading4', 'Heading4')]"
                 priority="56">
      <xsl:copy>
         <xsl:attribute name="docx2tex:config" select="'headline'"/>
         <xsl:apply-templates select="@*, node()"/>
      </xsl:copy>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('berschrift4', 'headline4', 'heading4', 'Heading4')]/dbk:phrase[@role eq 'hub:identifier']/@role"
                 priority="56">
      <xsl:attribute name="role" select="'docx2tex:identifier'"/>
   </xsl:template>
   <xsl:template match="dbk:para[@role = ('berschrift4', 'headline4', 'heading4', 'Heading4')]/@css:margin-left|dbk:para[@role = ('berschrift4', 'headline4', 'heading4', 'Heading4')]/@css:text-indent"
                 priority="56"/>
   <xsl:template match="dbk:para[@role = ('berschrift4', 'headline4', 'heading4', 'Heading4')]/dbk:tab"
                 priority="56">
      <phrase xmlns="http://docbook.org/ns/docbook" role="tab">
         <xsl:text/>
      </phrase>
   </xsl:template>
   <xsl:template match="@*|*|processing-instruction()">
      <xsl:copy>
         <xsl:apply-templates select="@*|node()"/>
      </xsl:copy>
   </xsl:template>
</xsl:stylesheet>
