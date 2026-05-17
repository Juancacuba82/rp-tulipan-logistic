[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$h = @{
    apikey = 'sb_publishable_Wt5TmlxBw3FOtZ_L_oWt0Q_RoMMVuni'
    Authorization = 'Bearer sb_publishable_Wt5TmlxBw3FOtZ_L_oWt0Q_RoMMVuni'
}
$u = 'https://xtrceqpuwqetzslwxxux.supabase.co/rest/v1/trips?select=status,has_sales,sales_price,qty,date&status=in.(COMPLETE,PAID,DELIVERED)&has_sales=eq.YES&sales_price=gt.0'
$r = Invoke-RestMethod -Uri $u -Headers $h -Method Get
$t = 0
$q = 0
foreach ($x in $r) {
    $t += ($x.sales_price * $x.qty)
    $q += $x.qty
}
Write-Output "Count: $($r.Count) | Units: $q | TotalSales: $t"
