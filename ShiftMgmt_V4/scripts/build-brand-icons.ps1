# Repackage the existing company symbol for Windows and browser icons. No artwork is redrawn.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'src\web\assets\brand-logo-transparent.png'
if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ine '06e5d1f84de4d2786a2035c3adc1912a653ce47af8b43896ef22fee201e44efc') { throw 'Review the symbol crop before using a different company logo.' }
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
public static class CompanyIconBuilder {
  static Bitmap Tile(Bitmap source, Rectangle crop, int size) {
    Bitmap tile = new Bitmap(size, size, PixelFormat.Format32bppArgb);
    using (Graphics g = Graphics.FromImage(tile)) {
      g.Clear(Color.Transparent);
      g.CompositingQuality = CompositingQuality.HighQuality;
      g.InterpolationMode = InterpolationMode.HighQualityBicubic;
      g.PixelOffsetMode = PixelOffsetMode.HighQuality;
      float scale = size * 0.88f / Math.Max(crop.Width, crop.Height);
      float w = crop.Width * scale, h = crop.Height * scale;
      g.DrawImage(source, new RectangleF((size-w)/2, (size-h)/2, w, h), crop, GraphicsUnit.Pixel);
    }
    return tile;
  }
  static byte[] Frame(Bitmap tile, int size) {
    using (MemoryStream stream = new MemoryStream()) {
      if (size == 256) { tile.Save(stream, ImageFormat.Png); return stream.ToArray(); }
      using (BinaryWriter writer = new BinaryWriter(stream)) {
        int maskRow = ((size + 31) / 32) * 4;
        writer.Write(40); writer.Write(size); writer.Write(size*2); writer.Write((ushort)1); writer.Write((ushort)32);
        writer.Write(0); writer.Write(size*size*4 + maskRow*size); writer.Write(0); writer.Write(0); writer.Write(0); writer.Write(0);
        for (int y=size-1; y>=0; y--) for (int x=0; x<size; x++) { Color c=tile.GetPixel(x,y); writer.Write(c.B); writer.Write(c.G); writer.Write(c.R); writer.Write(c.A); }
        for (int y=size-1; y>=0; y--) {
          byte[] row=new byte[maskRow];
          for (int x=0; x<size; x++) if(tile.GetPixel(x,y).A==0) row[x/8] |= (byte)(0x80 >> (x%8));
          writer.Write(row);
        }
        return stream.ToArray();
      }
    }
  }
  public static string Build(string sourceFile, string pngFile, string icoFile) {
    using (Bitmap source = new Bitmap(sourceFile)) {
      if (source.Width != 2171 || source.Height != 724) throw new Exception("Unexpected logo dimensions");
      // The wordmark begins after x=600. Keep the original symbol only.
      int left=550, top=640, right=0, bottom=80;
      for(int y=80;y<640;y++) for(int x=0;x<550;x++) if(source.GetPixel(x,y).A>=128) {left=Math.Min(left,x);right=Math.Max(right,x);top=Math.Min(top,y);bottom=Math.Max(bottom,y);}
      if(right<=left || bottom<=top) throw new Exception("Company symbol not found");
      Rectangle crop=new Rectangle(left,top,right-left+1,bottom-top+1);
      using(Bitmap png=Tile(source,crop,256)) png.Save(pngFile,ImageFormat.Png);
      int[] sizes={16,24,32,48,64,128,256}; byte[][] frames=new byte[sizes.Length][];
      for(int i=0;i<sizes.Length;i++) using(Bitmap tile=Tile(source,crop,sizes[i])) frames[i]=Frame(tile,sizes[i]);
      using(BinaryWriter writer=new BinaryWriter(File.Create(icoFile))) {
        writer.Write((ushort)0);writer.Write((ushort)1);writer.Write((ushort)sizes.Length);
        int offset=6+16*sizes.Length;
        for(int i=0;i<sizes.Length;i++) {writer.Write((byte)(sizes[i]==256?0:sizes[i]));writer.Write((byte)(sizes[i]==256?0:sizes[i]));writer.Write((byte)0);writer.Write((byte)0);writer.Write((ushort)1);writer.Write((ushort)32);writer.Write(frames[i].Length);writer.Write(offset);offset+=frames[i].Length;}
        foreach(byte[] frame in frames) writer.Write(frame);
      }
      return String.Format("BRAND_ICONS_OK crop={0},{1},{2},{3} sizes=16,24,32,48,64,128,256",crop.X,crop.Y,crop.Width,crop.Height);
    }
  }
}
'@
[CompanyIconBuilder]::Build($source, (Join-Path $root 'src\web\assets\brand-app.png'), (Join-Path $root 'src\web\assets\brand-app.ico'))
