using System.Text.Json;
using Dontus.Operations.Application;
using Dontus.Operations.Domain;
using Dontus.Operations.Infrastructure;
using Microsoft.EntityFrameworkCore;
namespace Dontus.Operations.Tests;
public sealed class RecordPagesTests
{
 private static readonly ActorContext Actor=new("ana@test","Ana","Analista","Suporte",[new("support",true,true,true,false,false),new("cs",true,true,true,false,false)]);
 private static OperationsDbContext Context()=>new(new DbContextOptionsBuilder<OperationsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
 private static RecordPages Pages(OperationsDbContext db)=>new(db,new OperationsService(db),null!,null!,null!,null!,null!);
 private static WorkItem Item(int n,string module="support")=>new(){Module=module,RecordType="Atendimento",Title=$"Cliente {n}",Status="Pendente",CreatedBy=Actor.Email,Owner=Actor.DisplayName,Description="{}"};
 [Fact]
 public async Task Each_page_loads_ten_current_records_and_supports_more_than_the_former_snapshot_limit()
 {
  await using var db=Context();var records=Enumerable.Range(1,1051).Select(n=>Item(n)).ToArray();db.WorkItems.AddRange(records);await db.SaveChangesAsync();
  var keys=records.Reverse().Select(item=>item.Id.ToString()).ToArray();var pages=Pages(db);
  var result=await pages.ReadAsync(new(["items"],keys,2,10),Actor,default);
  Assert.Equal(1051,result.Total);Assert.Equal(10,result.Rows.GetArrayLength());Assert.Equal(keys.Skip(10).Take(10),result.Keys);
  var changed=records.Single(item=>item.Id.ToString()==result.Keys[0]);changed.Title="Atualizado depois da primeira consulta";changed.Version++;await db.SaveChangesAsync();
  var fresh=await pages.ReadAsync(new(["items"],keys,2,10),Actor,default);Assert.Equal(changed.Title,fresh.Rows[0].GetProperty("title").GetString());
  var fifty=await pages.ReadAsync(new(["items"],keys,1,50),Actor,default);Assert.Equal(50,fifty.Rows.GetArrayLength());
  var last=await pages.ReadAsync(new(["items"],keys,9999,100),Actor,default);Assert.Equal(11,last.Page);Assert.Equal(51,last.Keys.Length);
 }
 [Fact]
 public async Task Unauthorized_and_validation_records_are_filtered_before_counting_and_paging()
 {
  await using var db=Context();var allowed=Item(1);var secret=Item(2,"admin");var validation=Item(3,"cs");validation.Description="{\"kind\":\"csJourney\",\"phase\":\"validation\"}";
  db.WorkItems.AddRange(allowed,secret,validation);await db.SaveChangesAsync();
  var page=await Pages(db).ReadAsync(new(["items"],[secret.Id.ToString(),validation.Id.ToString(),allowed.Id.ToString()],1,10),Actor,default);
  Assert.Equal(1,page.Total);Assert.Equal(allowed.Id.ToString(),Assert.Single(page.Keys));
 }
 [Fact]
 public async Task Nested_unit_lists_are_loaded_from_an_authorized_network()
 {
  await using var db=Context();var units=Enumerable.Range(1,23).Select(n=>new{id=Guid.NewGuid(),name=$"Unidade {n}"}).ToArray();var network=Item(1,"cs");network.Description=JsonSerializer.Serialize(new{kind="enterpriseNetwork",units});db.WorkItems.Add(network);await db.SaveChangesAsync();
  var page=await Pages(db).ReadAsync(new(["items",$"@id:{network.Id}","$json:description","units"],units.Select(unit=>unit.id.ToString()).ToArray(),2,10),Actor,default);
  Assert.Equal(23,page.Total);Assert.Equal(10,page.Rows.GetArrayLength());Assert.Equal("Unidade 11",page.Rows[0].GetProperty("name").GetString());
 }
 [Fact]
 public async Task Empty_queries_and_invalid_page_sizes_do_not_return_the_complete_collection()
 {
  await using var db=Context();var item=Item(1);db.WorkItems.Add(item);await db.SaveChangesAsync();var pages=Pages(db);
  var empty=await pages.ReadAsync(new(["items"],[],1,10),Actor,default);Assert.Empty(empty.Keys);Assert.Equal(0,empty.Total);
  var normal=await pages.ReadAsync(new(["items"],[item.Id.ToString()],0,999),Actor,default);Assert.Equal(1,normal.Page);Assert.Equal(10,normal.PageSize);
  await Assert.ThrowsAsync<DomainException>(()=>pages.ReadAsync(new(["__proto__"],[],1,10),Actor,default));
 }
}
