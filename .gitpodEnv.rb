#!/home/gitpod/.rvm/rubies/ruby-3.1.2/bin/ruby
fe = `gp env | grep REACT_APP`;
feOut = ""
fe.split(/\n/).each{|x|
  feOut += `echo #{x}`
}

`cp desci-dapp/.env.example desci-dapp/.env`
`echo "\n" >> desci-dapp/.env`
`echo "#{feOut}" >> desci-dapp/.env`
feEnv = `cat desci-dapp/.env`.gsub('host.docker.internal', `hostname`.gsub("\n", ""))
`echo "#{feEnv}" > desci-dapp/.env`
puts "wrote desci-dapp/.env"


be = `gp env | grep -v REACT_APP`;
beOut = ""
be.split(/\n/).each{|x|
  beOut += `echo #{x}`
}

`cp .env.example .env`
`echo "\n" >> .env`
`echo "#{beOut}" >> .env`
beEnv = `cat .env`.gsub('host.docker.internal:8000', `hostname`.gsub("\n", "") + ":8000")
`echo "#{beEnv}" > .env`
puts "wrote .env"