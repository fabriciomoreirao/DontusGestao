using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;

namespace Dontus.Operations.Infrastructure;

public static class CommissionConfirmationPdf
{
    private static readonly Lazy<bool> Fonts = new(() => { GlobalFontSettings.FontResolver = new ReportFonts(); return true; });
    private static readonly CultureInfo Pt = CultureInfo.GetCultureInfo("pt-BR");
    private static string Money(long cents) => (cents / 100m).ToString("C", Pt);
    private static string Stamp(string? value) => value?.Length == 10 && DateOnly.TryParseExact(value,"yyyy-MM-dd",out var day) ? day.ToString("dd/MM/yyyy",Pt)
        : DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date.ToOffset(TimeSpan.FromHours(-3)).ToString("dd/MM/yyyy HH:mm:ss", Pt) : "Não informado";

    public static byte[] Create(CommissionConfirmation entry)
    {
        if (!entry.AgreedAt.HasValue) throw new DomainException("O documento precisa estar assinado para gerar o PDF.", 409);
        _ = Fonts.Value;
        var report = JsonSerializer.Deserialize<CommissionReportSnapshot>(entry.SnapshotJson)!;
        using var document = new PdfDocument();
        document.Info.Title = $"Dontus - Comissões {entry.Competence} - {entry.EmployeeName}";
        document.Info.Author = "Dontus - Central de Operações";
        document.Info.CreationDate = entry.AgreedAt.Value.UtcDateTime;
        const double margin = 36, width = 523, bottom = 787;
        XSolidBrush Brush(int r,int g,int b) => new(XColor.FromArgb(r,g,b));
        var navy=Brush(20,46,73);var blue=Brush(8,127,234);var muted=Brush(106,130,151);
        var border=new XPen(XColor.FromArgb(213,228,240),.7);
        XGraphics? graphics=null; PdfPage? page=null;double y=0;
        XFont Font(double size,bool bold=false)=>new("DontusReport",size,bold?XFontStyleEx.Bold:XFontStyleEx.Regular);
        void Rect(double x,double top,double w,double h,XBrush fill) => graphics!.DrawRoundedRectangle(border,fill,new XRect(x,top,w,h),new XSize(10,10));
        void Draw(string value,double x,double top,double size=9,bool bold=false,XBrush? color=null) => graphics!.DrawString(value,Font(size,bold),color??navy,x,top,XStringFormats.TopLeft);
        void NewPage()
        {
            graphics?.Dispose();page=document.AddPage();page.Size=PdfSharp.PageSize.A4;graphics=XGraphics.FromPdfPage(page);
            graphics.DrawRectangle(Brush(239,246,252),0,0,page.Width.Point,page.Height.Point);
            var grid=new XPen(XColor.FromArgb(231,240,248),.35);
            for(double x=0;x<page.Width.Point;x+=32)graphics.DrawLine(grid,x,0,x,page.Height.Point);
            for(double top=0;top<page.Height.Point;top+=32)graphics.DrawLine(grid,0,top,page.Width.Point,top);
            graphics.DrawRoundedRectangle(blue,new XRect(margin,25,25,25),new XSize(7,7));Draw("D",margin+6,27,16,true,XBrushes.White);
            Draw("Dontus",margin+34,27,17,true);Draw("CENTRAL DE OPERAÇÕES",margin+35,48,6.4,true,muted);
            graphics.DrawString("DOCUMENTO ASSINADO",Font(7,true),Brush(30,123,88),new XRect(margin,35,width,12),XStringFormats.TopRight);
            y=76;
        }
        void Ensure(double height){if(page is null||y+height>bottom)NewPage();}
        List<string> Wrap(string value,double size,double available,bool bold=false)
        {
            var font=Font(size,bold);var lines=new List<string>();
            foreach(var paragraph in value.Replace("\r","").Split('\n'))
            {
                var line="";
                foreach(var word in paragraph.Split(' ',StringSplitOptions.RemoveEmptyEntries))
                {
                    var candidate=line.Length==0?word:line+" "+word;
                    if(graphics!.MeasureString(candidate,font).Width<=available){line=candidate;continue;}
                    if(line.Length>0){lines.Add(line);line="";}
                    foreach(var rune in word.EnumerateRunes())
                    {
                        if(line.Length>0&&graphics.MeasureString(line+rune,font).Width>available){lines.Add(line);line="";}
                        line+=rune.ToString();
                    }
                }
                lines.Add(line);
            }
            return lines;
        }
        void Panel(string title,string content,XBrush? fill=null,XBrush? ink=null)
        {
            var lines=Wrap(string.IsNullOrWhiteSpace(content)?"Não informado":content,9,width-30);var offset=0;
            while(offset<lines.Count)
            {
                Ensure(74);var count=Math.Min(lines.Count-offset,(int)((bottom-y-42)/14));var height=40+count*14;
                Rect(margin,y,width,height,fill??XBrushes.White);Draw(offset==0?title:title+" (continuação)",margin+15,y+12,7.5,true,ink??muted);
                for(var i=0;i<count;i++)Draw(lines[offset+i],margin+15,y+29+i*14,9,false,ink??navy);
                y+=height+10;offset+=count;
            }
        }
        void Grid(params (string Label,string Value)[] fields)
        {
            const double gap=14;var cell=(width-30-2*gap)/3;
            for(var start=0;start<fields.Length;start+=3)
            {
                var group=fields.Skip(start).Take(3).Select(f=>(f.Label,Lines:Wrap(string.IsNullOrWhiteSpace(f.Value)?"Não informado":f.Value,8.5,cell))).ToArray();
                var height=43+group.Max(f=>f.Lines.Count)*13;
                if(height>bottom-90){foreach(var f in fields.Skip(start).Take(3))Panel(f.Label,f.Value);continue;}
                Ensure(height);Rect(margin,y,width,height,XBrushes.White);
                for(var col=0;col<group.Length;col++)
                {
                    var x=margin+15+col*(cell+gap);Draw(group[col].Label,x,y+13,7,false,muted);
                    for(var l=0;l<group[col].Lines.Count;l++)Draw(group[col].Lines[l],x,y+29+l*13,8.5);
                }
                y+=height+8;
            }
        }
        NewPage();
        Panel("RELATÓRIO DE COMISSÕES",$"Competência {entry.Competence} - {report.EmployeeName}",Brush(248,252,255));
        const double metricGap=8;var metricWidth=(width-3*metricGap)/4;Ensure(83);
        var metrics=new[]{("VALOR DOS CLIENTES",Money(report.Rows.Sum(x=>x.SaleValueCents))), ("LANÇAMENTOS",report.Rows.Count.ToString()),("APROVADOS",report.Rows.Count(x=>x.Decision=="approved").ToString()),("TOTAL A PAGAR",Money(report.TotalCents))};
        for(var i=0;i<metrics.Length;i++)
        {
            var x=margin+i*(metricWidth+metricGap);Rect(x,y,metricWidth,73,i==3?Brush(15,113,204):XBrushes.White);
            Draw(metrics[i].Item1,x+10,y+13,6.3,true,i==3?Brush(218,239,255):muted);
            var valueSize=13d;while(graphics!.MeasureString(metrics[i].Item2,Font(valueSize,true)).Width>metricWidth-20&&valueSize>8)valueSize-=.5;
            Draw(metrics[i].Item2,x+10,y+34,valueSize,true,i==3?XBrushes.White:navy);
        }
        y+=85;
        Panel("FILTROS APLICADOS",string.Join("  |  ",report.Filters.Select(x=>x.Key+": "+x.Value)),Brush(247,251,255));
        Ensure(35);Draw("Detalhamento por cliente",margin+2,y+6,11,true);y+=32;
        foreach(var row in report.Rows)
        {
            Ensure(220);
            Panel((row.Decision=="approved"?"APROVADO":"REPROVADO")+(row.Manual?" - LANÇAMENTO MANUAL":""),row.CustomerName,Brush(245,250,255),blue);
            Grid(("Produto / serviço",row.Product),("Identificação do cliente",row.CustomerCode),("Status do cliente",row.CustomerStatus),
                ("Acompanhamento",row.SourceStatus),("Score de utilização",row.Score.HasValue?row.Score.Value.ToString(Pt)+"%":"Não informado"),("Utilização",row.UsageStatus),
                ("Kick off",Stamp(row.KickOffAt)),("Treinamento",Stamp(row.TrainingAt)),("Alinhamento único",Stamp(row.SingleAlignmentAt)));
            Panel("REGRA E MEMÓRIA DE CÁLCULO",$"Base: {Money(row.SaleValueCents)}\n{row.RuleLabel}\nValor a pagar: {Money(row.CommissionCents)}"+(row.Decision=="rejected"?" - Reprovado, sem pagamento.":""),Brush(235,245,255),Brush(35,82,128));
            Panel("MOTIVO DA "+(row.Decision=="approved"?"APROVAÇÃO":"REPROVAÇÃO"),row.Reason+"\n"+row.DecidedBy+" - "+Stamp(row.DecidedAt)+" (Brasília)");
            y+=10;
        }
        Ensure(370);
        Panel("CONCORDÂNCIA REGISTRADA","Li o relatório e concordo com os valores desta competência.",Brush(235,249,242),Brush(28,112,80));
        Grid(("Usuário que confirmou",entry.SignedByName.Length>0?entry.SignedByName:"Confirmação anterior ao registro autenticado"),("E-mail",entry.SignedByEmail),("Confirmação (Brasília)",Stamp(entry.AgreedAt.Value.ToString("O"))),
            ("Competência assinada",entry.Competence),("Total confirmado",Money(report.TotalCents)),("Identificador do usuário",entry.SignedByUserId?.ToString()??"Não registrado"));
        Ensure(158);Rect(margin,y,width,148,XBrushes.White);Draw("RUBRICA DO RESPONSÁVEL",margin+15,y+12,7,true,muted);
        var strokes=JsonSerializer.Deserialize<List<SignatureStroke>>(entry.SignatureJson)??[];
        if(strokes.Count==0)Draw("Rubrica não registrada na confirmação original.",margin+15,y+57,9,false,muted);
        else foreach(var stroke in strokes)for(var i=1;i<stroke.Points.Count;i++)
        {
            var from=stroke.Points[i-1];var to=stroke.Points[i];graphics!.DrawLine(new XPen(XColor.FromArgb(18,63,113),1.5),margin+15+from.X*(width-30),y+30+from.Y*103,margin+15+to.X*(width-30),y+30+to.Y*103);
        }
        y+=160;
        var browser=JsonNode.Parse(entry.BrowserJson)as JsonObject??new();string Browser(string key)=>browser[key]?.ToString()??"Não registrado";
        Panel("DADOS DO NAVEGADOR",Browser("userAgent")+"\nIdioma: "+Browser("Language")+" | Plataforma: "+Browser("Platform")+" | Fuso: "+Browser("TimeZone")+"\nTela: "+Browser("ScreenWidth")+" x "+Browser("ScreenHeight"));
        Panel("INTEGRIDADE DO REGISTRO (SHA-256)",entry.EvidenceHash);
        graphics!.Dispose();
        for(var i=0;i<document.PageCount;i++)
        {
            using var footer=XGraphics.FromPdfPage(document.Pages[i]);
            footer.DrawString($"Dontus - Documento {entry.Id:N}",Font(6.5),muted,margin,810,XStringFormats.TopLeft);
            footer.DrawString($"{i+1} / {document.PageCount}",Font(7),muted,new XRect(margin,810,width,12),XStringFormats.TopRight);
        }
        using var stream=new MemoryStream();document.Save(stream,false);return stream.ToArray();
    }

    private sealed class ReportFonts : IFontResolver
    {
        public FontResolverInfo ResolveTypeface(string familyName, bool bold, bool italic) => new(bold?"bold":"regular");
        public byte[] GetFont(string faceName)
        {
            var directory=Environment.GetEnvironmentVariable("DONTUS_PDF_FONT_DIR")??"/usr/share/fonts/truetype/dejavu";
            var file=Path.Combine(directory,faceName=="bold"?"DejaVuSans-Bold.ttf":"DejaVuSans.ttf");
            if(!File.Exists(file) && OperatingSystem.IsWindows())file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Fonts),faceName=="bold"?"arialbd.ttf":"arial.ttf");
            return File.ReadAllBytes(file);
        }
    }
}
