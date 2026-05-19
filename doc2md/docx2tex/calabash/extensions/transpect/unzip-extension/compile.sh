#!/bin/bash
CLASSPATH='C:/cygwin64/home/paul/calabash-100/xmlcalabash-1.3.2-100.jar;C:/cygwin64/home/paul/calabash-1_3/saxon/saxon-he-10.5.jar;C:/cygwin64/home/paul/dev/xproc-unzip/unzip-extension/lib/*;C:/cygwin64/home/paul/dev/xproc-unzip/unzip-extension/io/transpect/calabash/extensions/UnZip.class'

echo "--- start compiling"
#echo $CLASSPATH							
javac -Xdiags:verbose -Xlint:unchecked -Xlint:deprecation -source 1.7 -target 1.7 -d . -cp $CLASSPATH \
      src/main/java/io/transpect/calabash/extensions/UnZip.java \

if [ $? == 0 ]; then
    echo "--- compile finished"
    echo "--- deploy"
    rm -rf ../../../calabash/extensions/transpect/unzip-extension || exit 1
    mkdir --parents ../../../calabash/extensions/transpect/unzip-extension || exit 1
    cp -r xmlcatalog ../../../calabash/extensions/transpect/unzip-extension/ || exit 1
    cp *.xpl ../../../calabash/extensions/transpect/unzip-extension/ || exit 1
    cp -r io ../../../calabash/extensions/transpect/unzip-extension/ || exit 1
    cp -r lib ../../../calabash/extensions/transpect/unzip-extension/ || exit 1
    cp -r src ../../../calabash/extensions/transpect/unzip-extension/ || exit 1
else
    echo "--- ERROR: while compile"
fi
